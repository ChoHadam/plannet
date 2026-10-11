import { test, expect } from '@playwright/test';
import {
  canonicalJson, legacySyncStorageKey, parsePendingState, PlannerCommit, PlannerDocument, PlannerRecord, PlannerSync, PlannerSyncError, recordKey,
} from '../../src/lib/plannerSync';
import { findLegacyUnsentDrafts } from '../../src/lib/legacyBrowserDrafts';
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
  const remote = new Map(initial.map((item) => [recordKey(item), item]));
  const replies = new Map<string, PlannerRecord[]>();
  const requests: PlannerCommit[] = [];
  let fail = '';
  let counter = 0;
  let current: PlannerDocument[] = [];
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
    read: async () => clone([...remote.values()]), commit,
    apply: (documents) => { current = documents; }, onStatus: () => {}, newRequestId: () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    ...overrides,
  });
  return { remote, requests, create, commit, fail: (value: string) => { fail = value; }, current: () => current };
}

test('JSONB key order is equal; missing storage flag keeps old local auth mode', () => {
  expect(canonicalJson({ b: 1, a: [2] })).toBe(canonicalJson({ a: [2], b: 1 }));
  expect(canonicalJson({ month: undefined, a: [undefined] })).toBe(canonicalJson({ a: [null] }));
  const user = { externalSubject: 'alice', authProvider: 'google' };
  expect(parseMeBody({ authenticated: true, user })).toMatchObject({ kind: 'authenticated', storageEnabled: false });
  expect(parseMeBody({ authenticated: true, storageEnabled: true, user })).toEqual({ kind: 'invalid' });
  expect(parseMeBody({ authenticated: true, storageEnabled: true, user: { ...user, userId: USER } })).toMatchObject({ kind: 'authenticated', storageEnabled: true });
});

test('lost ACK: the living tab re-sends the identical request, so the server version bumps once', async () => {
  const f = fixture();
  const engine = f.create();
  await engine.start();
  engine.capture([doc()]);
  expect(engine.getStatus()).toMatchObject({ dirty: true, phase: 'saving' });
  f.fail('after');
  await engine.flush();
  expect(engine.getStatus()).toMatchObject({ phase: 'error', dirty: true });
  expect(engine.getStatus().message).not.toContain('저장됐어요');
  const request = engine.getSnapshot().inflight;
  f.fail('');
  await engine.retry();
  expect(f.requests).toHaveLength(2);
  expect(f.requests[1]).toEqual(request);
  expect(engine.getSnapshot().drafts).toEqual([]);
  expect(engine.getStatus()).toMatchObject({ phase: 'saved', dirty: false });
  expect(f.remote.get('daily:one')?.version).toBe(1);
  engine.stop();
});

test('a new tab never restores an old in-memory state: it reads fresh DB records only', async () => {
  const f = fixture([record(doc('one', 'DB 값'))]);
  const first = f.create();
  await first.start();
  first.capture([doc('one', '보내지 못한 수정')]);
  f.fail('before');
  await first.flush();
  first.stop();
  f.fail('');
  const second = f.create();
  await second.start();
  expect(f.current()[0].data.title).toBe('DB 값');
  expect(second.getStatus()).toMatchObject({ phase: 'saved', dirty: false, loaded: true });
  expect(f.requests).toHaveLength(1);
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

test('conflict keeps the draft in memory until a confirmed discard; a stale confirmation is refused', async () => {
  const f = fixture([record()]);
  const engine = f.create();
  await engine.start();
  engine.capture([doc('one', '내 수정')]);
  f.remote.set('daily:one', record(doc('one', '다른 기기'), 2));
  await engine.flush();
  expect(engine.getStatus()).toMatchObject({ phase: 'conflict', dirty: true });
  expect(engine.getStatus().message).not.toContain('보관');
  expect(engine.backupText()).toContain('내 수정');

  // 확인 뒤 새 수정 → 거부, 초안 유지
  const confirmed = engine.getStatus().revision;
  engine.capture([doc('one', '확인 뒤 수정')]);
  expect(await engine.useServer(confirmed)).toBe(false);
  expect(engine.getSnapshot().drafts[0].data?.title).toBe('확인 뒤 수정');

  // 현재 revision으로 확인하면 서버 내용으로 바꾼다
  expect(await engine.useServer(engine.getStatus().revision)).toBe(true);
  expect(f.current()[0].data.title).toBe('다른 기기');
  expect(engine.getStatus()).toMatchObject({ phase: 'saved', dirty: false });
  engine.stop();

  // 읽는 동안 새 수정 → 거부, 초안 유지
  const reading = f.create();
  await reading.start();
  reading.capture([doc('one', '읽기 전 수정')]);
  f.remote.set('daily:one', record(doc('one', '또 다른 기기'), 3));
  await reading.flush();
  expect(reading.getStatus().phase).toBe('conflict');
  const during = reading.getStatus().revision;
  const pending = reading.useServer(during);
  reading.capture([doc('one', '읽는 중 수정')]);
  expect(await pending).toBe(false);
  expect(reading.getSnapshot().drafts[0].data?.title).toBe('읽는 중 수정');
  reading.stop();
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
  expect(await engine.settle()).toBe(false);
  engine.stop();
  // 다시 로그인한 새 탭은 이전 탭의 초안을 자동으로 보내지 않는다 (파일로만 복구)
  f.fail('');
  const relogged = f.create();
  await relogged.start();
  expect(relogged.getStatus().phase).toBe('saved');
  expect(f.remote.has('daily:one')).toBe(false);
  expect(f.requests).toHaveLength(1);
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

test('settle waits for a running save and reports true only when every edit is acknowledged', async () => {
  const f = fixture();
  let release!: () => void;
  let once = true;
  const engine = f.create({ commit: async (request) => {
    if (once) { once = false; await new Promise<void>((resolve) => { release = resolve; }); }
    return f.commit(request);
  } });
  await engine.start();
  engine.capture([doc('one', '첫 수정')]);
  const flushing = engine.flush();
  engine.capture([doc('one', '전송 중 수정')]);
  const settling = engine.settle();
  release();
  await flushing;
  expect(await settling).toBe(true);
  expect(f.remote.get('daily:one')?.data?.title).toBe('전송 중 수정');

  engine.capture([doc('one', '실패할 수정')]);
  f.fail('before');
  expect(await engine.settle()).toBe(false);
  expect(engine.getStatus()).toMatchObject({ phase: 'error', dirty: true });
  engine.stop();
});

test('legacy durable-cache drafts are detected read-only for the same account only', () => {
  const other = '20000000-0000-4000-8000-000000000002';
  const entries = new Map<string, string>([
    [legacySyncStorageKey(USER), JSON.stringify({ drafts: [{ id: 'a' }], inflight: { changes: [{ id: 'b' }] } })],
    [`${legacySyncStorageKey(USER)}:backup:1`, '{"archived":true}'],
    [`plannet-daily@cloud:${USER}`, '{"state":{}}'],
    [legacySyncStorageKey(other), JSON.stringify({ drafts: [{ id: 'other' }] })],
  ]);
  const snapshot = new Map(entries);
  const storage = { getItem: (key: string) => entries.get(key) ?? null, key: (index: number) => [...entries.keys()][index] ?? null, get length() { return entries.size; } };
  const bundle = findLegacyUnsentDrafts(USER, storage)!;
  expect(bundle.pendingCount).toBe(2);
  expect(bundle.keys.sort()).toEqual([legacySyncStorageKey(USER), `${legacySyncStorageKey(USER)}:backup:1`, `plannet-daily@cloud:${USER}`].sort());
  expect(bundle.text).not.toContain('other');
  expect(entries).toEqual(snapshot);

  entries.set(legacySyncStorageKey(USER), '{broken');
  entries.delete(`${legacySyncStorageKey(USER)}:backup:1`);
  expect(findLegacyUnsentDrafts(USER, storage)?.pendingCount).toBeNull();
  entries.set(legacySyncStorageKey(USER), JSON.stringify({ drafts: [], inflight: null }));
  expect(findLegacyUnsentDrafts(USER, storage)).toBeNull();
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

// ---- 새로고침 대비 임시 보관(pending journal) ----

function memoryJournal(initial: string | null = null) {
  let raw = initial;
  let failWrites = false;
  const writes: string[] = [];
  const journal = {
    read: () => {
      if (raw === null) return { status: 'empty' as const };
      try {
        const state = parsePendingState(JSON.parse(raw), USER);
        return state ? { status: 'ok' as const, state, raw } : { status: 'invalid' as const, raw };
      } catch { return { status: 'invalid' as const, raw }; }
    },
    write: (state: { drafts: unknown[]; inflight: unknown }) => {
      if (failWrites) return false;
      raw = JSON.stringify({ format: 1, userId: USER, savedAt: 'now', ...state });
      writes.push(raw);
      return true;
    },
    clear: () => { if (failWrites) return false; raw = null; return true; },
  };
  return { journal, raw: () => raw, writes, failWrites: (value: boolean) => { failWrites = value; } };
}

test('journal holds only changed records and the exact inflight request, and is removed when clean', async () => {
  const f = fixture([record(doc('one', 'DB')), record(doc('other', '그대로'))]);
  const j = memoryJournal();
  const engine = f.create({ journal: j.journal });
  await engine.start();
  expect(j.raw()).toBeNull();
  engine.capture([doc('one', '바뀜'), doc('other', '그대로')]);
  const pending = JSON.parse(j.raw()!);
  expect(pending.drafts.map((draft: { id: string }) => draft.id)).toEqual(['one']);
  expect(pending).not.toHaveProperty('base');
  expect(pending.inflight).toBeNull();
  f.fail('after');
  await engine.flush();
  const inflight = JSON.parse(j.raw()!).inflight;
  expect(inflight).toEqual(f.requests[0]);
  f.fail('');
  await engine.retry();
  expect(f.requests[1]).toEqual(f.requests[0]);
  expect(j.raw()).toBeNull();
  expect(engine.getStatus()).toMatchObject({ phase: 'saved', protection: 'active' });
  engine.stop();
});

test('journal restores only after a successful DB read; lost-ACK inflight is re-sent once and drafts already in the DB are dropped', async () => {
  const f = fixture([record(doc('one', 'DB'))]);
  const j = memoryJournal();
  const writer = f.create({ journal: j.journal });
  await writer.start();
  writer.capture([doc('one', '저장될 수정')]);
  f.fail('after');
  await writer.flush();
  writer.stop();
  f.fail('');
  expect(f.remote.get('daily:one')?.version).toBe(2);

  // 새로고침: DB를 먼저 읽고, 그 뒤 같은 requestId로 재전송 → 영수증으로 한 번만 반영
  let reads = 0;
  const applied: PlannerDocument[][] = [];
  const reloaded = f.create({ journal: j.journal, read: async () => { reads++; return clone([...f.remote.values()]); }, apply: (documents) => { applied.push(documents); } });
  // 인증·DB 조회 전에는 아무것도 적용·표시하지 않는다
  expect(reloaded.isDirty()).toBe(true);
  expect(applied).toEqual([]);
  await reloaded.start();
  expect(reads).toBe(1);
  expect(applied[0].map((document) => document.data.title)).toEqual(['저장될 수정']);
  await reloaded.flush();
  expect(f.requests).toHaveLength(2);
  expect(f.requests[1]).toEqual(f.requests[0]);
  expect(f.remote.get('daily:one')?.version).toBe(2);
  expect(reloaded.getStatus()).toMatchObject({ phase: 'saved', dirty: false });
  expect(j.raw()).toBeNull();
  reloaded.stop();

  // inflight 없이 DB와 같은 내용만 남은 보관은 보내지 않고 정리한다
  const same = memoryJournal(JSON.stringify({ format: 1, userId: USER, drafts: [{ kind: 'daily', id: 'one', schemaVersion: 1, expectedVersion: 1, data: doc('one', '저장될 수정').data }], inflight: null }));
  const clean = f.create({ journal: same.journal });
  await clean.start();
  await clean.flush();
  expect(f.requests).toHaveLength(2);
  expect(same.raw()).toBeNull();
  clean.stop();
});

test('late ACK keeps a newer journaled draft; a failed first read keeps the journal and blocks settle', async () => {
  const f = fixture([record(doc('one', 'DB'))]);
  const j = memoryJournal();
  let release!: () => void;
  let once = true;
  const engine = f.create({ journal: j.journal, commit: async (request) => {
    if (once) { once = false; await new Promise<void>((resolve) => { release = resolve; }); }
    return f.commit(request);
  } });
  await engine.start();
  engine.capture([doc('one', '첫 수정')]);
  const sending = engine.flush();
  engine.capture([doc('one', '늦은 응답 뒤 수정')]);
  release();
  await sending;
  // 첫 응답 처리 직후의 보관본: 새 수정이 지워지지 않고, 확인된 버전(2)으로만 재기준된다
  const rebased = j.writes.map((raw) => JSON.parse(raw)).find((write) => write.inflight === null && write.drafts[0]?.data?.title === '늦은 응답 뒤 수정');
  expect(rebased.drafts).toHaveLength(1);
  expect(rebased.drafts[0].expectedVersion).toBe(2);
  await engine.settle();
  expect(f.remote.get('daily:one')?.data?.title).toBe('늦은 응답 뒤 수정');
  expect(j.raw()).toBeNull();
  engine.stop();

  const stored = memoryJournal(JSON.stringify({ format: 1, userId: USER, drafts: [{ kind: 'daily', id: 'one', schemaVersion: 1, expectedVersion: 3, data: doc('one', '보관본').data }], inflight: null }));
  const offline = f.create({ journal: stored.journal, read: async () => { throw new Error('offline'); } });
  await offline.start();
  expect(offline.getStatus()).toMatchObject({ phase: 'error', loaded: false, dirty: true, pendingCount: 1 });
  expect(await offline.settle()).toBe(false);
  expect(offline.backupText()).toContain('보관본');
  expect(stored.raw()).toContain('보관본');
  offline.stop();
});

test('journal write failure never blocks DB saving; malformed or wrong-account journals are kept verbatim and not applied', async () => {
  const f = fixture([record(doc('one', 'DB'))]);
  const j = memoryJournal();
  j.failWrites(true);
  const engine = f.create({ journal: j.journal });
  await engine.start();
  engine.capture([doc('one', '보관 실패해도 저장')]);
  expect(engine.getStatus().protection).toBe('unavailable');
  await engine.flush();
  expect(f.remote.get('daily:one')?.data?.title).toBe('보관 실패해도 저장');
  expect(engine.getStatus().phase).toBe('saved');
  j.failWrites(false);
  engine.capture([doc('one', '보관 복구')]);
  expect(engine.getStatus().protection).toBe('active');
  engine.stop();

  for (const bad of ['{broken', JSON.stringify({ format: 1, userId: 'someone-else', drafts: [], inflight: null }),
    JSON.stringify({ format: 1, userId: USER, drafts: [{ kind: 'daily', id: 'one', schemaVersion: 1, expectedVersion: -1, data: null }], inflight: null }),
    JSON.stringify({ format: 1, userId: USER, drafts: [], inflight: { requestId: 'bad id!', changes: [] } })]) {
    const kept = memoryJournal(bad);
    const requests = f.requests.length;
    const reader = f.create({ journal: kept.journal });
    await reader.start();
    reader.capture([doc('one', `새 수정 ${bad.length}`)]);
    await reader.flush();
    expect(reader.getStatus().protection).toBe('invalid');
    expect(reader.invalidJournalText()).toBe(bad);
    expect(kept.raw()).toBe(bad);
    expect(f.requests.length).toBe(requests + 1);
    expect(reader.discardInvalidJournal()).toBe(true);
    expect(kept.raw()).toBeNull();
    reader.stop();
  }
});
