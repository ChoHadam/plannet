import { test, expect } from '@playwright/test';
import {
  canonicalJson, PlannerCommit, PlannerDocument, PlannerRecord, PlannerSync, PlannerSyncError, recordKey, syncStorageKey,
} from '../../src/lib/plannerSync';
import { applyPlannerDocuments, readLegacyDocuments, readPlannerDocuments, PLANNER_STORES } from '../../src/lib/plannerSyncStores';
import { useMandalartStore } from '../../src/hooks/useMandalart';
import { useMonthlyStore } from '../../src/hooks/useMonthly';
import { GRID_POSITIONS } from '../../src/types/mandalart';
import { parseMeBody } from '../../src/lib/authContract';

const USER = '10000000-0000-4000-8000-000000000001';
const doc = (id = 'one', title = '초안'): PlannerDocument => ({ kind: 'daily', id, data: {
  id, template: 'daily', category: 'daily', title, year: 2026, month: 9, day: 26, todos: [], memo: '',
  createdAt: '2026-09-26T00:00:00Z', updatedAt: '2026-09-26T00:00:00Z',
} });
const record = (document = doc(), version = 1): PlannerRecord => ({ ...document, schemaVersion: 1, version, deleted: false, updatedAt: '2026-09-26T00:00:00Z' });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fixture(initial: PlannerRecord[] = []) {
  const local = new Map<string, string>();
  const remote = new Map(initial.map((item) => [recordKey(item), item]));
  const replies = new Map<string, PlannerRecord[]>();
  const requests: PlannerCommit[] = [];
  let fail = '';
  let counter = 0;
  let current: PlannerDocument[] = [];
  const storage = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => { local.set(key, value); } };
  const commit = async (request: PlannerCommit) => {
    requests.push(clone(request));
    if (fail === 'before') throw new Error('offline');
    if (fail === 'account') throw new PlannerSyncError('account_changed');
    if (replies.has(request.requestId)) return clone(replies.get(request.requestId)!);
    for (const change of request.changes) {
      if ((remote.get(recordKey(change))?.version ?? 0) !== change.expectedVersion) throw new PlannerSyncError('version_conflict');
    }
    const records = request.changes.map((change): PlannerRecord => ({ ...change, version: change.expectedVersion + 1, deleted: change.data === null, updatedAt: '2026-09-26T01:00:00Z' }));
    records.forEach((item) => remote.set(recordKey(item), clone(item)));
    replies.set(request.requestId, clone(records));
    if (fail === 'after') throw new Error('lost ACK');
    return records;
  };
  const create = (overrides: Partial<ConstructorParameters<typeof PlannerSync>[1]> = {}) => new PlannerSync(USER, {
    storage, read: async () => clone([...remote.values()]), commit,
    apply: (documents) => { current = documents; }, onStatus: () => {}, newRequestId: () => `request-${++counter}`,
    ...overrides,
  });
  return { local, remote, requests, storage, create, commit, fail: (value: string) => { fail = value; }, current: () => current };
}

test('JSONB key order is equal; missing storage flag keeps old local auth mode', () => {
  expect(canonicalJson({ b: 1, a: [2] })).toBe(canonicalJson({ a: [2], b: 1 }));
  expect(canonicalJson({ month: undefined, a: [undefined] })).toBe(canonicalJson({ a: [null] }));
  const user = { externalSubject: 'alice', authProvider: 'google' };
  expect(parseMeBody({ authenticated: true, user })).toMatchObject({ kind: 'authenticated', storageEnabled: false });
  expect(parseMeBody({ authenticated: true, storageEnabled: true, user })).toEqual({ kind: 'invalid' });
  expect(parseMeBody({ authenticated: true, storageEnabled: true, user: { ...user, userId: USER } })).toMatchObject({ kind: 'authenticated', storageEnabled: true });
});

test('edits persist before debounce; exact inflight request survives accepted POST with lost ACK and reload', async () => {
  const f = fixture();
  const first = f.create();
  await first.start();
  first.capture([doc()]);
  expect(JSON.parse(f.local.get(syncStorageKey(USER))!).drafts[0].data.title).toBe('초안');
  f.fail('after');
  await first.flush();
  expect(first.getStatus().phase).toBe('error');
  const request = first.getSnapshot().inflight;
  first.stop();
  f.fail('');
  const second = f.create();
  await second.start();
  expect(f.requests).toHaveLength(2);
  expect(f.requests[1]).toEqual(request);
  expect(second.getSnapshot().drafts).toEqual([]);
  expect(second.getStatus().phase).toBe('saved');
  expect(f.remote.get('daily:one')?.version).toBe(1);
  second.stop();
});

test('late ACK retains a newer edit and even an undo to the old server value', async () => {
  const f = fixture([record(doc('one', '기존'))]);
  let release!: () => void;
  let arrived!: () => void;
  const waiting = new Promise<void>((resolve) => { arrived = resolve; });
  let once = true;
  const engine = f.create({ commit: async (request) => {
    if (once) { once = false; arrived(); await new Promise<void>((resolve) => { release = resolve; }); }
    return f.commit(request);
  } });
  await engine.start();
  engine.capture([doc('one', '전송 중')]);
  const sending = engine.flush();
  await waiting;
  engine.capture([doc('one', '기존')]);
  release();
  await sending;
  expect(f.requests.map((request) => request.changes[0].expectedVersion)).toEqual([1, 2]);
  expect(f.remote.get('daily:one')?.data?.title).toBe('기존');
  expect(engine.getSnapshot().drafts).toEqual([]);
  engine.stop();
});

test('conflicts survive reload; choosing latest server archives draft before replacement', async () => {
  const f = fixture([record()]);
  const first = f.create();
  await first.start();
  first.capture([doc('one', '내 수정')]);
  f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
  await first.flush();
  expect(first.getStatus().phase).toBe('conflict');
  first.stop();
  const second = f.create();
  await second.start();
  expect(second.getStatus().phase).toBe('conflict');
  expect(f.current()[0].data.title).toBe('내 수정');
  await second.useServer();
  expect([...f.local.entries()].find(([key]) => key.includes(':backup:'))?.[1]).toContain('내 수정');
  expect(f.current()[0].data.title).toBe('다른 기기');
  expect(second.getStatus().phase).toBe('saved');
  second.stop();
});

test('offline initial read cannot expose empty editable state, overwrite server, or report saved', async () => {
  const f = fixture([record()]);
  const engine = f.create({ read: async () => { throw new Error('offline'); } });
  await engine.start();
  engine.capture([doc('wrong')]);
  await engine.flush();
  expect(engine.getStatus()).toMatchObject({ phase: 'error', ready: false });
  expect(f.requests).toHaveLength(0);
  engine.stop();
});

test('session mismatch blocks further sends and preserves the account draft', async () => {
  const f = fixture();
  const engine = f.create();
  await engine.start();
  engine.capture([doc()]);
  f.fail('account');
  await engine.flush();
  await engine.retry();
  expect(f.requests).toHaveLength(1);
  expect(engine.getSnapshot().blocked).toBe('account');
  expect(engine.backupText()).toContain('초안');
  engine.stop();
  f.fail('');
  const relogged = f.create();
  await relogged.start();
  expect(relogged.getStatus().phase).toBe('saved');
  expect(f.remote.get('daily:one')?.data?.title).toBe('초안');
  relogged.stop();
});

test('legacy import collision leaves all incoming records untouched and preserves tombstones', async () => {
  const f = fixture([record(), { ...record(doc('deleted')), deleted: true, data: null }]);
  const engine = f.create();
  await engine.start();
  expect(engine.importDocuments([doc(), doc('fresh')])).toEqual({ added: 1, skipped: 1, collisions: [] });
  expect(engine.importDocuments([doc('one', '다른 내용'), doc('blocked')])).toEqual({ added: 0, skipped: 0, collisions: ['daily:one'] });
  expect(engine.documents().some((item) => item.id === 'blocked')).toBe(false);
  expect(engine.importDocuments([doc('deleted')]).collisions).toEqual(['daily:deleted']);
  engine.stop();
});

test('large migration uses bounded batches without changing reference IDs', async () => {
  const f = fixture();
  const engine = f.create();
  await engine.start();
  const documents = Array.from({ length: 205 }, (_, index) => ({ ...doc(`plan-${index}`), data: { ...doc(`plan-${index}`).data, sourceId: 'retained-source' } }));
  engine.importDocuments(documents);
  await engine.flush();
  expect(f.requests.map((request) => request.changes.length)).toEqual([100, 100, 5]);
  expect(f.remote.get('daily:plan-204')?.data?.sourceId).toBe('retained-source');
  expect(engine.getStatus().phase).toBe('saved');
  engine.stop();
});

test('linked Monthly completion and Mandalart cell edit become one atomic commit', async () => {
  const mandalart: PlannerDocument = { kind: 'mandalart', id: 'mandala', data: {
    id: 'mandala', template: 'mandalart', category: 'annual', title: '연간', createdAt: '2026-09-26T00:00:00Z', updatedAt: '2026-09-26T00:00:00Z',
    grids: GRID_POSITIONS.map((id) => ({ id, color: '#DBEAFE', cells: Array.from({ length: 9 }, (_, position) => ({ id: `${id}-${position}`, position, value: '목표' })) })),
  } };
  const monthly: PlannerDocument = { kind: 'monthly', id: 'month', data: {
    id: 'month', template: 'monthly', category: 'monthly', title: '월간', year: 2026, month: 9, memo: '', createdAt: '2026-09-26T00:00:00Z', updatedAt: '2026-09-26T00:00:00Z',
    goals: [{ id: 'goal', text: '목표', progress: 0, completed: false, sourceMandalartId: 'mandala', sourceCellId: 'top-left-0' }],
    weeklyFocus: [1, 2, 3, 4, 5].map((weekNumber) => ({ weekNumber, text: '' })),
  } };
  const f = fixture([record(mandalart), record(monthly)]);
  const engine = f.create({ apply: applyPlannerDocuments });
  await engine.start();
  const stops = PLANNER_STORES.map((store) => store.subscribe(() => engine.capture(readPlannerDocuments())));
  useMonthlyStore.getState().selectMonthlyPlan('month');
  useMonthlyStore.getState().toggleGoalCompleted('goal', true);
  await engine.flush();
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0].changes.map((change) => change.kind).sort()).toEqual(['mandalart', 'monthly']);
  expect(useMandalartStore.getState().mandalarts[0].grids[0].cells[0].completed).toBe(true);
  stops.forEach((stop) => stop());
  engine.stop();
});

test('partially accepted large import reports remaining drafts and never loses failed batches', async () => {
  const f = fixture();
  let commits = 0;
  const engine = f.create({ commit: async (request) => {
    if (++commits === 2) throw new PlannerSyncError('version_conflict');
    return f.commit(request);
  } });
  await engine.start();
  engine.importDocuments(Array.from({ length: 205 }, (_, index) => doc(`plan-${index}`)));
  await engine.flush();
  expect(f.remote.size).toBe(100);
  expect(engine.getStatus()).toMatchObject({ phase: 'conflict', pendingCount: 105 });
  expect(engine.getSnapshot().inflight?.changes).toHaveLength(100);
  expect(engine.getSnapshot().drafts).toHaveLength(105);
  engine.stop();
});

test('storage quota blocks network and prevents destructive server reload without a durable archive', async () => {
  const f = fixture();
  let quota = false;
  const engine = f.create({ storage: { ...f.storage, setItem: (key, value) => { if (quota) throw new Error('quota'); f.storage.setItem(key, value); } } });
  await engine.start();
  quota = true;
  engine.capture([doc()]);
  await engine.flush();
  expect(f.requests).toHaveLength(0);
  await engine.useServer();
  expect(engine.getSnapshot().drafts[0].data?.title).toBe('초안');
  expect(engine.getStatus().message).toContain('파일로 저장');
  engine.stop();
});

test('malformed local envelope is preserved and cannot silently become an empty server overwrite', async () => {
  const f = fixture();
  f.local.set(syncStorageKey(USER), '{broken');
  const engine = f.create();
  await engine.start();
  expect(engine.getStatus()).toMatchObject({ phase: 'error', ready: false });
  expect(engine.backupText()).toBe('{broken');
  expect(f.local.get(syncStorageKey(USER))).toBe('{broken');
  engine.stop();
});

test('legacy import is read-only; template IDs and source references remain intact', () => {
  const source = JSON.stringify({ version: 0, state: { dailyPlans: [{ ...doc().data, todos: [{ id: 'todo', text: '원본', completed: false, sourceType: 'monthly', sourceId: 'monthly-id', sourceCellId: 'cell-id' }] }] } });
  const documents = readLegacyDocuments('local', { getItem: (key) => key === 'plannet-daily' ? source : null });
  expect(documents[0].data.todos).toEqual([{ id: 'todo', text: '원본', completed: false, sourceType: 'monthly', sourceId: 'monthly-id', sourceCellId: 'cell-id' }]);
  expect(source).toContain('monthly-id');
});

test('wholesale server apply invalidates pending AI responses', () => {
  useMandalartStore.setState({ resetToken: null });
  applyPlannerDocuments([]);
  const first = useMandalartStore.getState().resetToken;
  applyPlannerDocuments([]);
  expect(first).not.toBeNull();
  expect(useMandalartStore.getState().resetToken).not.toBe(first);
});
