import { test, expect } from '@playwright/test';
import {
  PendingJournal, PendingState, PlannerCommit, PlannerDocument, PlannerRecord, PlannerSync, PlannerSyncError, RefreshHold, RefreshImpact, recordKey,
} from '../../src/lib/plannerSync';
import { plannerSyncApi } from '../../src/lib/plannerSyncApi';
import { applyChangedPlannerDocuments, applyPlannerDocuments, plannerRefreshImpact } from '../../src/lib/plannerSyncStores';
import { useMandalartStore } from '../../src/hooks/useMandalart';
import { useDailyStore } from '../../src/hooks/useDaily';
import { useMonthlyStore } from '../../src/hooks/useMonthly';
import { useRecurringStore } from '../../src/hooks/useRecurring';
import { GRID_POSITIONS } from '../../src/types/mandalart';

// Synthetic accounts and plans only.
const USER = '10000000-0000-4000-8000-000000000001';
const doc = (id = 'one', title = '서버'): PlannerDocument => ({ kind: 'daily', id, data: {
  id, template: 'daily', category: 'daily', title, year: 2026, month: 10, day: 4, todos: [], memo: '',
  createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z',
} });
const record = (document = doc(), version = 1): PlannerRecord => ({ ...document, schemaVersion: 1, version, deleted: false, updatedAt: '2026-10-04T00:00:00Z' });
const tombstone = (id: string, version: number): PlannerRecord => ({ ...record(doc(id), version), deleted: true, data: null });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
};

/** Server double + recorders. `readGate` holds the next read until opened; `hold` is the UI refresh hold. */
function fixture(initial: PlannerRecord[] = [record()]) {
  const remote = new Map(initial.map((item) => [recordKey(item), item]));
  const requests: PlannerCommit[] = [];
  const journalCalls: string[] = [];
  const applied: PlannerDocument[][] = [];
  const refreshed: PlannerDocument[][] = [];
  let reads = 0;
  let readGate: Promise<void> | null = null;
  let readFailure: Error | null = null;
  let commitGate: Promise<void> | null = null;
  let hold: (impact?: RefreshImpact) => RefreshHold | null = () => null;
  let activity = 0;
  let invalid = false;
  let counter = 0;
  const journal: PendingJournal = {
    read: () => ({ status: 'empty' }),
    write: (state: PendingState) => { journalCalls.push(`write:${state.drafts.length}:${state.inflight ? 1 : 0}`); return true; },
    clear: () => { journalCalls.push('clear'); return true; },
  };
  const engine = new PlannerSync(USER, {
    read: async () => {
      reads++;
      const snapshot = clone([...remote.values()]);
      if (readGate) { const waiting = readGate; readGate = null; await waiting; }
      if (readFailure) throw readFailure;
      return snapshot;
    },
    commit: async (request) => {
      requests.push(clone(request));
      if (commitGate) await commitGate;
      for (const change of request.changes) {
        if ((remote.get(recordKey(change))?.version ?? 0) !== change.expectedVersion) throw new PlannerSyncError('version_conflict');
      }
      const records = request.changes.map((change): PlannerRecord => ({ ...change, version: change.expectedVersion + 1, deleted: change.data === null, updatedAt: '2026-10-04T01:00:00Z' }));
      records.forEach((item) => remote.set(recordKey(item), clone(item)));
      return records;
    },
    apply: (documents) => { applied.push(clone(documents)); },
    applyRefresh: (documents) => { refreshed.push(clone(documents)); },
    validateDocuments: (documents) => { if (invalid && documents.some((item) => item.data.title === '깨진 기록')) throw new PlannerSyncError('invalid_response'); },
    refreshHold: (impact) => hold(impact),
    inputActivity: () => activity,
    refreshImpact: (documents) => ({ selectionRemoved: !documents.some((item) => item.id === 'one') }),
    onStatus: () => {},
    newRequestId: () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    journal,
  });
  return {
    engine, remote, requests, journalCalls, applied, refreshed,
    reads: () => reads,
    gateRead: () => { const g = gate(); readGate = g.promise; return g.open; },
    gateCommit: () => { const g = gate(); commitGate = g.promise; return () => { commitGate = null; g.open(); }; },
    failReads: (error: Error | null) => { readFailure = error; },
    setHold: (value: typeof hold) => { hold = value; },
    input: () => { activity++; },
    breakDocuments: () => { invalid = true; },
  };
}
async function started(initial?: PlannerRecord[]) {
  const f = fixture(initial);
  await f.engine.start();
  f.journalCalls.length = 0;
  return f;
}
const titles = (documents: PlannerDocument[]) => documents.map((item) => `${item.id}:${item.data.title}`).sort();

test.describe('safe refresh engine', () => {
  test('clean 200 applies remote edits and deletions once, with no write and no journal change', async () => {
    const f = await started([record(), record(doc('two', '두 번째'))]);
    f.remote.set('daily:one', record(doc('one', '다른 기기 수정'), 2));
    f.remote.set('daily:two', tombstone('two', 2));
    f.remote.set('daily:three', record(doc('three', '새 플랜')));
    await f.engine.refresh();
    expect(f.refreshed).toHaveLength(1);
    expect(titles(f.refreshed[0])).toEqual(['one:다른 기기 수정', 'three:새 플랜']);
    expect(f.engine.getSnapshot().base.find((item) => item.id === 'one')?.version).toBe(2);
    expect(f.engine.getStatus()).toMatchObject({ phase: 'saved', dirty: false, refresh: { state: 'updated', changed: true, selectionRemoved: false } });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(f.requests).toHaveLength(0);
    expect(f.journalCalls).toEqual([]);
    // Later edits use the refreshed version, so they do not conflict.
    f.engine.capture(f.engine.documents().map((item) => item.id === 'one' ? doc('one', '이어서 수정') : item));
    await f.engine.flush();
    expect(f.requests[0].changes[0]).toMatchObject({ id: 'one', expectedVersion: 2 });
    expect(f.engine.getStatus().refresh.state).toBe('idle');
    f.engine.stop();
  });

  test('unchanged content never reapplies stores; newer versions of equal data are adopted silently', async () => {
    const f = await started();
    await f.engine.refresh();
    f.remote.set('daily:one', record(doc(), 3));
    await f.engine.refresh();
    expect(f.reads()).toBe(3);
    expect(f.refreshed).toHaveLength(0);
    expect(f.applied).toHaveLength(1);
    expect(f.engine.getSnapshot().base[0].version).toBe(3);
    expect(f.engine.getStatus().refresh).toEqual({ state: 'idle', reason: null, changed: false, selectionRemoved: false });
    expect(f.requests).toHaveLength(0);
    expect(f.journalCalls).toEqual([]);
    f.engine.stop();
  });

  test('capture with store-shared references: same objects never draft; nested edit, revert and deletion are exact', async () => {
    const withTodos = doc('one');
    withTodos.data.todos = [{ id: 't1', text: '가상 할 일', completed: false }];
    const f = await started([record(withTodos), record(doc('two', '두 번째'))]);
    const shared = f.engine.documents();
    // Selection/view-only store updates re-read the same plan objects.
    f.engine.capture([...shared]);
    expect(f.engine.getStatus().dirty).toBe(false);
    const one = shared.find((item) => item.id === 'one')!;
    const todos = one.data.todos as { completed: boolean }[];
    const edited = { ...one, data: { ...one.data, todos: [{ ...todos[0], completed: true }] } };
    f.engine.capture(shared.map((item) => item === one ? edited : item));
    // Journaled before the debounce.
    expect(f.journalCalls).toEqual(['write:1:0']);
    expect(f.engine.getSnapshot().drafts).toMatchObject([{ id: 'one', expectedVersion: 1, data: { todos: [{ completed: true }] } }]);
    // A new object equal to the server copy (undo) is compared by content.
    f.engine.capture(shared.map((item) => item === one ? clone(one) : item));
    expect(f.engine.getStatus().dirty).toBe(false);
    f.engine.capture(shared.filter((item) => item.id !== 'two'));
    expect(f.engine.getSnapshot().drafts).toMatchObject([{ id: 'two', data: null, expectedVersion: 1 }]);
    await f.engine.flush();
    expect(f.requests).toHaveLength(1);
    expect(f.remote.get('daily:two')?.deleted).toBe(true);
    f.engine.stop();
  });

  test('refresh keeps the identity of unchanged data, adopts its newer version, and re-compares changed records', async () => {
    const f = await started([record(), record(doc('two', '두 번째'))]);
    const before = f.engine.documents();
    f.remote.set('daily:one', record(doc(), 3));
    f.remote.set('daily:two', record(doc('two', '다른 기기 수정'), 2));
    await f.engine.refresh();
    const after = f.engine.documents();
    expect(after.find((item) => item.id === 'one')!.data).toBe(before.find((item) => item.id === 'one')!.data);
    expect(after.find((item) => item.id === 'two')!.data.title).toBe('다른 기기 수정');
    expect(f.engine.getSnapshot().base.find((item) => item.id === 'one')?.version).toBe(3);
    expect(f.engine.getStatus().dirty).toBe(false);
    f.engine.capture(after.map((item) => item.id === 'one' ? doc('one', '이어서 수정') : item));
    await f.engine.flush();
    expect(f.requests[0].changes).toMatchObject([{ id: 'one', expectedVersion: 3, data: { title: '이어서 수정' } }]);
    f.engine.stop();
  });

  test('concurrent refresh requests share one read', async () => {
    const f = await started();
    const open = f.gateRead();
    const calls = [f.engine.refresh(), f.engine.refresh(), f.engine.refresh()];
    open();
    await Promise.all(calls);
    expect(f.reads()).toBe(2);
    f.engine.stop();
  });

  test('unsaved draft defers without reading; after the ACK the refresh runs and keeps the saved edit', async () => {
    const f = await started([record(), record(doc('two', '두 번째'))]);
    f.engine.capture([doc('one', '내 수정'), doc('two', '두 번째')]);
    f.remote.set('daily:two', record(doc('two', '다른 기기'), 2));
    await f.engine.refresh();
    expect(f.reads()).toBe(1);
    expect(f.engine.getStatus().refresh).toMatchObject({ state: 'deferred', reason: 'unsaved' });
    await f.engine.flush();
    await expect.poll(() => f.refreshed.length).toBe(1);
    expect(titles(f.refreshed[0])).toEqual(['one:내 수정', 'two:다른 기기']);
    expect(f.engine.getStatus()).toMatchObject({ dirty: false, refresh: { state: 'updated' } });
    expect(f.journalCalls.at(-1)).toBe('clear');
    f.engine.stop();
  });

  test('an inflight request defers the refresh until its ACK', async () => {
    const f = await started();
    f.engine.capture([doc('one', '전송 중')]);
    const release = f.gateCommit();
    const sending = f.engine.flush();
    await expect.poll(() => f.requests.length).toBe(1);
    expect(f.engine.getSnapshot().inflight).not.toBeNull();
    await f.engine.refresh();
    expect(f.reads()).toBe(1);
    expect(f.engine.getStatus().refresh.reason).toBe('unsaved');
    release();
    await sending;
    await expect.poll(() => f.reads()).toBe(2);
    expect(f.refreshed).toHaveLength(0); // the server equals the acknowledged edit
    expect(f.engine.getStatus().refresh.state).toBe('idle');
    f.engine.stop();
  });

  test('conflict blocks refresh (draft kept); only the confirmed server choice clears it', async () => {
    const f = await started();
    f.engine.capture([doc('one', '내 수정')]);
    f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
    await f.engine.flush();
    expect(f.engine.getStatus().phase).toBe('conflict');
    const reads = f.reads();
    await f.engine.refresh();
    expect(f.reads()).toBe(reads);
    expect(f.refreshed).toHaveLength(0);
    expect(f.engine.getSnapshot().drafts[0].data?.title).toBe('내 수정');
    expect(f.engine.getStatus().refresh).toMatchObject({ state: 'deferred', reason: 'blocked' });
    expect(await f.engine.useServer(f.engine.getStatus().revision)).toBe(true);
    expect(f.engine.getStatus().refresh.state).toBe('idle');
    f.engine.stop();
  });

  test('an unreadable journal blocks refresh and is never cleared by it', async () => {
    const remote = [record()];
    const writes: string[] = [];
    const engine = new PlannerSync(USER, {
      read: async () => clone(remote), commit: async () => [], apply: () => {}, onStatus: () => {}, newRequestId: () => crypto.randomUUID(),
      journal: { read: () => ({ status: 'invalid', raw: '{broken' }), write: () => { writes.push('write'); return true; }, clear: () => { writes.push('clear'); return true; } },
    });
    await engine.start();
    await engine.refresh();
    expect(engine.getStatus()).toMatchObject({ protection: 'invalid', refresh: { state: 'deferred', reason: 'blocked' } });
    expect(engine.invalidJournalText()).toBe('{broken');
    expect(writes).toEqual([]);
    engine.stop();
  });

  test('edit during the read: response discarded, autosave still sends after the read, then refresh applies', async () => {
    const f = await started([record(), record(doc('two', '두 번째'))]);
    f.remote.set('daily:two', record(doc('two', '다른 기기'), 2));
    const open = f.gateRead();
    const refreshing = f.engine.refresh();
    await expect.poll(() => f.reads()).toBe(2);
    f.engine.capture([doc('one', '읽는 중 수정'), doc('two', '두 번째')]);
    // Let the 650ms debounce fire while the read is still pending.
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(f.requests).toHaveLength(0);
    open();
    await refreshing;
    expect(f.refreshed).toHaveLength(0);
    expect(f.engine.getStatus().refresh).toMatchObject({ state: 'deferred', reason: 'unsaved' });
    // The debounced save skipped by exclusive() during the read is rescheduled, not lost.
    await expect.poll(() => f.requests.length, { timeout: 3_000 }).toBe(1);
    expect(f.requests[0].changes).toEqual([expect.objectContaining({ id: 'one', expectedVersion: 1 })]);
    await expect.poll(() => f.refreshed.length).toBe(1);
    expect(titles(f.refreshed[0])).toEqual(['one:읽는 중 수정', 'two:다른 기기']);
    f.engine.stop();
  });

  test('edit then revert during the read still discards that response; a fresh read is applied only afterwards', async () => {
    const f = await started();
    f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
    const first = f.gateRead();
    const refreshing = f.engine.refresh();
    await expect.poll(() => f.reads()).toBe(2);
    f.engine.capture([doc('one', '잠깐 수정')]);
    f.engine.capture([doc('one', '서버')]);
    expect(f.engine.isDirty()).toBe(false);
    const second = f.gateRead();
    first();
    await expect.poll(() => f.reads()).toBe(3);
    expect(f.refreshed).toHaveLength(0);
    second();
    await refreshing;
    expect(titles(f.refreshed[0])).toEqual(['one:다른 기기']);
    expect(f.requests).toHaveLength(0);
    f.engine.stop();
  });

  test('component-local input during the read (no store change) also discards the response', async () => {
    const f = await started();
    f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
    const open = f.gateRead();
    const refreshing = f.engine.refresh();
    await expect.poll(() => f.reads()).toBe(2);
    f.input();
    f.setHold(() => 'editing');
    open();
    await refreshing;
    expect(f.refreshed).toHaveLength(0);
    expect(f.engine.getStatus().refresh).toMatchObject({ state: 'deferred', reason: 'editing' });
    f.setHold(() => null);
    await f.engine.resumeRefresh();
    expect(titles(f.refreshed[0])).toEqual(['one:다른 기기']);
    f.engine.stop();
  });

  test('UI holds: editing before the read skips it; a hold seen after a changed read keeps base and reports the change', async () => {
    const f = await started();
    f.setHold(() => 'assistant');
    await f.engine.refresh();
    expect(f.reads()).toBe(1);
    expect(f.engine.getStatus().refresh).toEqual({ state: 'deferred', reason: 'assistant', changed: false, selectionRemoved: false });
    f.setHold((impact) => impact?.selectionRemoved ? 'draft' : null);
    f.remote.set('daily:one', tombstone('one', 2));
    await f.engine.refresh();
    expect(f.engine.getStatus().refresh).toEqual({ state: 'deferred', reason: 'draft', changed: true, selectionRemoved: false });
    expect(f.engine.getSnapshot().base[0]).toMatchObject({ version: 1, deleted: false });
    expect(f.refreshed).toHaveLength(0);
    f.setHold(() => null);
    await f.engine.resumeRefresh();
    expect(f.refreshed).toEqual([[]]);
    expect(f.engine.getStatus().refresh).toMatchObject({ state: 'updated', selectionRemoved: true });
    expect(f.journalCalls).toEqual([]);
    f.engine.stop();
  });

  test('a late response for a stopped (logged out / switched) account is ignored', async () => {
    const f = await started();
    f.remote.set('daily:one', record(doc('one', '이전 계정 응답'), 2));
    const open = f.gateRead();
    const refreshing = f.engine.refresh();
    await expect.poll(() => f.reads()).toBe(2);
    f.engine.stop();
    const status = f.engine.getStatus();
    open();
    await refreshing;
    expect(f.refreshed).toHaveLength(0);
    expect(f.engine.getSnapshot().base[0].version).toBe(1);
    expect(f.engine.getStatus()).toBe(status);
    await f.engine.refresh();
    expect(f.reads()).toBe(2);
  });

  test('network failure keeps content and save state, does not block logout, and a later retry applies', async () => {
    const f = await started();
    f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
    f.failReads(new Error('offline'));
    await f.engine.refresh();
    expect(f.engine.getStatus()).toMatchObject({ phase: 'saved', dirty: false, refresh: { state: 'failed', reason: 'network' } });
    expect(f.engine.getSnapshot().base[0].version).toBe(1);
    expect(f.refreshed).toHaveLength(0);
    expect(await f.engine.settle()).toBe(true);
    f.failReads(null);
    await f.engine.refresh();
    expect(titles(f.refreshed[0])).toEqual(['one:다른 기기']);
    f.engine.stop();
  });

  test('invalid documents are rejected before base or stores change; a valid copy applies later', async () => {
    const f = await started();
    f.breakDocuments();
    f.remote.set('daily:one', record(doc('one', '깨진 기록'), 2));
    const before = f.engine.getSnapshot();
    await f.engine.refresh();
    expect(f.engine.getSnapshot()).toEqual(before);
    expect(f.refreshed).toHaveLength(0);
    expect(f.engine.getStatus()).toMatchObject({ phase: 'saved', refresh: { state: 'failed', reason: 'invalid' } });
    f.remote.set('daily:one', record(doc('one', '고친 기록'), 3));
    await f.engine.refresh();
    expect(titles(f.refreshed[0])).toEqual(['one:고친 기록']);
    f.engine.stop();
  });

  test('a throwing store apply restores the previous base', async () => {
    const remote = new Map([[recordKey(record()), record()]]);
    const engine = new PlannerSync(USER, {
      read: async () => clone([...remote.values()]), commit: async () => [], apply: () => {}, onStatus: () => {}, newRequestId: () => crypto.randomUUID(),
      applyRefresh: () => { throw new PlannerSyncError('invalid_response'); },
    });
    await engine.start();
    remote.set('daily:one', record(doc('one', '다른 기기'), 2));
    await engine.refresh();
    expect(engine.getSnapshot().base[0].version).toBe(1);
    expect(engine.getStatus().refresh).toMatchObject({ state: 'failed', reason: 'invalid' });
    engine.stop();
  });

  test('401 or account mismatch on refresh blocks writes and keeps later edits recoverable', async () => {
    for (const code of ['unauthorized', 'account_changed']) {
      const f = await started();
      f.failReads(new PlannerSyncError(code));
      await f.engine.refresh();
      expect(f.engine.getStatus()).toMatchObject({ phase: 'error', refresh: { state: 'deferred', reason: 'blocked' } });
      expect(f.engine.getSnapshot().blocked).toBe('account');
      f.engine.capture([doc('one', '차단 뒤 수정')]);
      await f.engine.flush();
      expect(f.requests).toHaveLength(0);
      expect(f.engine.backupText()).toContain('차단 뒤 수정');
      expect(f.refreshed).toHaveLength(0);
      f.engine.stop();
    }
  });

  test('useServer and import racing a refresh are neither swallowed nor overwritten', async () => {
    const f = await started();
    f.engine.capture([doc('one', '충돌 수정')]);
    f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
    await f.engine.flush();
    expect(f.engine.getStatus().phase).toBe('conflict');
    const revision = f.engine.getStatus().revision;
    const open = f.gateRead();
    const choosing = f.engine.useServer(revision);
    const refreshing = f.engine.refresh();
    open();
    expect(await choosing).toBe(true);
    await refreshing;
    expect(f.engine.getStatus()).toMatchObject({ phase: 'saved', dirty: false });

    // An import during the read becomes a draft; the read is not applied over it and the import is saved.
    f.remote.set('daily:one', record(doc('one', '또 다른 기기'), 3));
    const second = f.gateRead();
    const again = f.engine.refresh();
    await expect.poll(() => f.reads()).toBe(3);
    expect(f.engine.importDocuments([doc('imported', '가져온 기록')]).added).toBe(1);
    second();
    await again;
    expect(f.engine.documents().some((item) => item.id === 'imported')).toBe(true);
    await expect.poll(() => f.remote.get('daily:imported')?.version, { timeout: 3_000 }).toBe(1);
    await expect.poll(() => f.refreshed.length).toBe(1);
    expect(titles(f.refreshed[0])).toContain('one:또 다른 기기');
    f.engine.stop();
  });
});

test.describe('refresh through the ETag adapter', () => {
  let originalFetch: typeof fetch;
  test.beforeEach(() => { originalFetch = globalThis.fetch; });
  test.afterEach(() => { globalThis.fetch = originalFetch; });

  test('304 is a no-op; a 200 read while held is applied later from the cached 304 without a reset', async () => {
    const queue: Response[] = [];
    const sent: Headers[] = [];
    globalThis.fetch = async (_url, options) => { sent.push(new Headers(options?.headers)); return queue.shift()!; };
    const body = (records: PlannerRecord[]) => ({ userId: USER, records });
    const api = plannerSyncApi(USER);
    const refreshed: PlannerDocument[][] = [];
    let hold: RefreshHold | null = null;
    const engine = new PlannerSync(USER, {
      ...api, apply: () => {}, applyRefresh: (documents) => { refreshed.push(documents); }, refreshHold: () => hold,
      onStatus: () => {}, newRequestId: () => crypto.randomUUID(),
    });
    queue.push(Response.json(body([record()]), { headers: { ETag: '"a"' } }));
    await engine.start();
    queue.push(new Response(null, { status: 304, headers: { ETag: '"a"' } }));
    await engine.refresh();
    expect(refreshed).toHaveLength(0);
    expect(sent[1].get('If-None-Match')).toBe('"a"');
    // Read while still clean, but the UI started editing before the response arrived.
    queue.push(Response.json(body([record(doc('one', '다른 기기'), 2)]), { headers: { ETag: '"b"' } }));
    const reading = engine.refresh();
    hold = 'editing';
    await reading;
    expect(refreshed).toHaveLength(0);
    expect(engine.getStatus().refresh).toMatchObject({ state: 'deferred', reason: 'editing', changed: true });
    hold = null;
    queue.push(new Response(null, { status: 304, headers: { ETag: '"b"' } }));
    await engine.resumeRefresh();
    expect(sent[3].get('If-None-Match')).toBe('"b"');
    expect(titles(refreshed[0])).toEqual(['one:다른 기기']);
    engine.stop();
  });
});

test.describe('refresh store application', () => {
  const daily = (id: string, title: string) => doc(id, title).data;
  const mandalart = (id: string) => ({
    id, template: 'mandalart', category: 'annual', title: '만다라트', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z',
    grids: GRID_POSITIONS.map((position) => ({ id: position, color: 'slate', cells: Array.from({ length: 9 }, (_, index) => ({ id: `${position}-${index}`, position: index, value: '' })) })),
  });
  const docs = (dailies: [string, string][]) => [
    { kind: 'mandalart' as const, id: 'm1', data: mandalart('m1') },
    ...dailies.map(([id, title]) => ({ kind: 'daily' as const, id, data: daily(id, title) })),
    { kind: 'recurring' as const, id: 'default', data: { todos: [] } },
  ];

  test('only changed stores are replaced; selection survives or is reported and cleared when deleted', () => {
    applyPlannerDocuments(docs([['d1', '하나'], ['d2', '둘']]));
    useDailyStore.setState({ currentDailyId: 'd1' });
    useMandalartStore.setState({ currentId: null });
    const mandalartState = useMandalartStore.getState();
    const { resetToken } = mandalartState;
    const monthlyPlans = useMonthlyStore.getState().monthlyPlans;
    const recurring = useRecurringStore.getState().todos;
    const next = docs([['d1', '다른 기기 수정'], ['d2', '둘']]);
    expect(plannerRefreshImpact(next)).toEqual({ selectionRemoved: false });
    applyChangedPlannerDocuments(next);
    expect(useDailyStore.getState().currentDailyId).toBe('d1');
    expect(useDailyStore.getState().dailyPlans.find((plan) => plan.id === 'd1')?.title).toBe('다른 기기 수정');
    expect(useMandalartStore.getState().mandalarts).toBe(mandalartState.mandalarts);
    expect(useMandalartStore.getState().resetToken).toBe(resetToken);
    expect(useMonthlyStore.getState().monthlyPlans).toBe(monthlyPlans);
    expect(useRecurringStore.getState().todos).toBe(recurring);

    const removed = docs([['d2', '둘']]);
    expect(plannerRefreshImpact(removed)).toEqual({ selectionRemoved: true });
    applyChangedPlannerDocuments(removed);
    expect(useDailyStore.getState().currentDailyId).toBeNull();
    expect(useDailyStore.getState().dailyPlans.map((plan) => plan.id)).toEqual(['d2']);
  });

  test('an invalid document leaves every store untouched', () => {
    applyPlannerDocuments(docs([['d1', '하나']]));
    const plans = useDailyStore.getState().dailyPlans;
    const broken = docs([['d1', '하나']]);
    broken.push({ kind: 'daily', id: 'bad', data: { ...daily('bad', '깨짐'), todos: 'nope' } as never });
    expect(() => applyChangedPlannerDocuments(broken)).toThrow();
    expect(useDailyStore.getState().dailyPlans).toBe(plans);
  });
});
