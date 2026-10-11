import { test, expect } from '@playwright/test';
import { PlannerCommit, PlannerRecord, PlannerSync, PlannerSyncError } from '../../src/lib/plannerSync';
import { findLegacyUnsentDrafts } from '../../src/lib/legacyBrowserDrafts';
import { pendingJournalKey, sessionPendingJournal } from '../../src/lib/pendingJournal';

const USER = '10000000-0000-4000-8000-000000000099';
const record: PlannerRecord = {
  kind: 'daily', id: 'one', schemaVersion: 1, version: 1, deleted: false,
  updatedAt: '2026-09-28T00:00:00Z', data: { title: 'server' },
};

function fixture() {
  let invalid = true;
  let commitCount = 0;
  const engine = new PlannerSync(USER, {
    read: async () => [record],
    commit: async () => { commitCount++; throw new PlannerSyncError('network'); },
    apply: () => { if (invalid) throw new PlannerSyncError('invalid_response'); },
    onStatus: () => {},
    newRequestId: () => 'synthetic-request',
  });
  return { engine, valid: () => { invalid = false; }, invalid: () => { invalid = true; }, commits: () => commitCount };
}

test('document validation failure keeps initial editors closed and retry fetches the DB again', async () => {
  const f = fixture();
  try {
    await f.engine.start();
    expect(f.engine.getStatus()).toMatchObject({ phase: 'error', loaded: false, ready: false, dirty: false });
    f.engine.capture([]);
    expect(f.engine.isDirty()).toBe(false);
    expect(f.commits()).toBe(0);
    f.valid();
    await f.engine.retry();
    expect(f.engine.getStatus()).toMatchObject({ phase: 'saved', loaded: true, ready: true });
  } finally { f.engine.stop(); }
});

test('invalid replacement data retains all unsaved changes after explicit server-content selection', async () => {
  const f = fixture();
  try {
    f.valid();
    await f.engine.start();
    f.engine.capture([{ kind: 'daily', id: 'one', data: { title: 'unsaved edit' } }]);
    const before = f.engine.getSnapshot();
    f.invalid();
    expect(await f.engine.useServer(f.engine.getStatus().revision)).toBe(false);
    expect(f.engine.getSnapshot()).toEqual(before);
    expect(f.engine.backupText()).toContain('unsaved edit');
    expect(f.engine.getStatus()).toMatchObject({ phase: 'error', dirty: true });
    expect(f.commits()).toBe(0);
  } finally { f.engine.stop(); }
});

test('unavailable localStorage property cannot crash the DB workspace legacy check', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => { throw new DOMException('Storage disabled', 'SecurityError'); },
  });
  try {
    expect(findLegacyUnsentDrafts(USER)).toBeNull();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('a valid newer draft cannot hide a malformed inflight payload during recovery', async () => {
  const change = { kind: 'daily', id: 'one', schemaVersion: 1, expectedVersion: 1, data: { title: 'newer valid edit' } };
  const raw = JSON.stringify({
    format: 1, userId: USER, drafts: [change],
    inflight: {
      requestId: '10000000-0000-4000-8000-000000000001',
      changes: [{ ...change, data: { title: 42 } }],
    },
  });
  const values = new Map([[pendingJournalKey(USER), raw]]);
  let commits = 0;
  let applied: unknown;
  const engine = new PlannerSync(USER, {
    read: async () => [record],
    commit: async () => { commits++; throw new PlannerSyncError('network'); },
    apply: (documents) => { applied = documents; },
    validateDocuments: (documents) => {
      if (documents.some(({ data }) => typeof data.title !== 'string')) throw new PlannerSyncError('invalid_response');
    },
    journal: sessionPendingJournal(USER, () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    })),
    onStatus: () => {},
    newRequestId: () => '10000000-0000-4000-8000-000000000002',
  });
  try {
    await engine.start();
    await engine.flush();
    expect(engine.getStatus()).toMatchObject({ loaded: true, dirty: false, protection: 'invalid' });
    expect(applied).toEqual([{ kind: record.kind, id: record.id, data: record.data }]);
    expect(engine.invalidJournalText()).toBe(raw);
    expect(values.get(pendingJournalKey(USER))).toBe(raw);
    expect(commits).toBe(0);
  } finally { engine.stop(); }
});

test('journal recovery rejects a request ID that the API cannot replay', () => {
  const raw = JSON.stringify({
    format: 1, userId: USER, drafts: [],
    inflight: {
      requestId: 'invalid-request-id',
      changes: [{ kind: 'daily', id: 'one', schemaVersion: 1, expectedVersion: 1, data: { title: 'pending' } }],
    },
  });
  const journal = sessionPendingJournal(USER, () => ({
    getItem: () => raw, setItem: () => {}, removeItem: () => {},
  }));
  expect(journal.read()).toEqual({ status: 'invalid', raw });
});

test('reload preserves an undo to the DB value while the preceding edit is still inflight', async () => {
  const change = { kind: record.kind, id: record.id, schemaVersion: 1, expectedVersion: 1, data: record.data };
  const request: PlannerCommit = {
    requestId: '10000000-0000-4000-8000-000000000011',
    changes: [{ ...change, schemaVersion: 1, data: { title: 'intermediate edit' } }],
  };
  const values = new Map([[pendingJournalKey(USER), JSON.stringify({
    format: 1, userId: USER, drafts: [change], inflight: request,
  })]]);
  let remote = record;
  const requests: PlannerCommit[] = [];
  const engine = new PlannerSync(USER, {
    read: async () => [remote],
    commit: async (incoming) => {
      requests.push(incoming);
      expect(incoming.changes[0].expectedVersion).toBe(remote.version);
      remote = { ...remote, data: incoming.changes[0].data, version: remote.version + 1 };
      return [remote];
    },
    apply: () => {}, onStatus: () => {},
    newRequestId: () => '10000000-0000-4000-8000-000000000012',
    journal: sessionPendingJournal(USER, () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    })),
  });
  try {
    await engine.start();
    await engine.flush();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(request);
    expect(requests[1].changes[0]).toMatchObject({ expectedVersion: 2, data: record.data });
    expect(remote).toMatchObject({ version: 3, data: record.data });
    expect(engine.getStatus()).toMatchObject({ phase: 'saved', dirty: false });
    expect(values.size).toBe(0);
  } finally { engine.stop(); }
});
