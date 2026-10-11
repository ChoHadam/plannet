import { test, expect } from '@playwright/test';
import { plannerSyncApi } from '../../src/lib/plannerSyncApi';
import { PlannerRecord } from '../../src/lib/plannerSync';

const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ETAG = 'W/"planner-v1-synthetic"';
const record: PlannerRecord = {
  kind: 'daily', id: 'one', schemaVersion: 1, version: 1, deleted: false,
  updatedAt: '2026-09-28T00:00:00Z', data: { title: 'server' },
};
const response = (records = [record], etag: string | null = ETAG, userId = USER) =>
  Response.json({ userId, records }, { headers: etag ? { ETag: etag } : {} });
const unchanged = (etag = ETAG) => new Response(null, { status: 304, headers: { ETag: etag } });

let originalFetch: typeof fetch;
test.beforeEach(() => { originalFetch = globalThis.fetch; });
test.afterEach(() => { globalThis.fetch = originalFetch; });

function mockFetch(responses: Array<Response | Error>) {
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(options ?? {});
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    if (next instanceof Error) throw next;
    return next;
  };
  return requests;
}

test('unchanged reads reuse only the validated account snapshot and return independent copies', async () => {
  const requests = mockFetch([response(), unchanged(), unchanged()]);
  const api = plannerSyncApi(USER);
  const first = await api.read();
  first[0].data!.title = 'local unsaved edit';
  const second = await api.read();
  expect(second).toEqual([record]);
  second.splice(0);
  expect(await api.read()).toEqual([record]);
  expect(new Headers(requests[0].headers).has('If-None-Match')).toBe(false);
  for (const request of requests.slice(1)) {
    expect(new Headers(request.headers).get('If-None-Match')).toBe(ETAG);
    expect(new Headers(request.headers).get('X-Plannet-User-Id')).toBe(USER);
    expect(request.cache).toBe('no-store');
  }
});

test('changes and tombstones replace the complete snapshot; adapters never share accounts or reload caches', async () => {
  const deleted = { ...record, version: 2, deleted: true, data: null };
  const requests = mockFetch([response(), response([deleted], 'W/"changed"'), response([], ETAG, OTHER), response()]);
  const api = plannerSyncApi(USER);
  await api.read();
  expect(await api.read()).toEqual([deleted]);
  expect(await plannerSyncApi(OTHER).read()).toEqual([]);
  await plannerSyncApi(USER).read();
  expect(new Headers(requests[2].headers).has('If-None-Match')).toBe(false);
  expect(new Headers(requests[3].headers).has('If-None-Match')).toBe(false);
});

test('an unsolicited or mismatched 304 is an error, never an empty workspace', async () => {
  mockFetch([unchanged()]);
  await expect(plannerSyncApi(USER).read()).rejects.toMatchObject({ code: 'invalid_response' });
  const requests = mockFetch([response(), unchanged('W/"wrong"'), response()]);
  const api = plannerSyncApi(USER);
  await api.read();
  await expect(api.read()).rejects.toMatchObject({ code: 'invalid_response' });
  await api.read();
  expect(new Headers(requests[2].headers).has('If-None-Match')).toBe(false);
});

test('account mismatch and expired authentication invalidate the in-memory snapshot', async () => {
  const requests = mockFetch([
    response(), Response.json({ error: 'account_changed' }, { status: 409 }), response(),
    new Response(null, { status: 401 }), response(), response([], ETAG, OTHER), response(),
  ]);
  const api = plannerSyncApi(USER);
  await api.read();
  await expect(api.read()).rejects.toMatchObject({ code: 'account_changed' });
  await api.read();
  await expect(api.read()).rejects.toMatchObject({ code: 'unauthorized' });
  await api.read();
  await expect(api.read()).rejects.toMatchObject({ code: 'account_changed' });
  await api.read();
  for (const index of [2, 4, 6]) expect(new Headers(requests[index].headers).has('If-None-Match')).toBe(false);
});

test('servers without ETags keep working and malformed records never become a reusable snapshot', async () => {
  const requests = mockFetch([response([record], null), response(), response([{ ...record, version: -1 }]), response()]);
  const api = plannerSyncApi(USER);
  await api.read();
  await api.read();
  expect(new Headers(requests[1].headers).has('If-None-Match')).toBe(false);
  await expect(api.read()).rejects.toMatchObject({ code: 'invalid_response' });
  await api.read();
  expect(new Headers(requests[3].headers).has('If-None-Match')).toBe(false);
});

test('a lost write acknowledgement invalidates the previous snapshot before another read', async () => {
  const updated = { ...record, version: 2, data: { title: 'saved' } };
  const requests = mockFetch([
    response(), Response.json({ headerName: 'X-CSRF-TOKEN', token: 'synthetic' }),
    new Error('lost ACK'), response([updated], 'W/"changed"'),
  ]);
  const api = plannerSyncApi(USER);
  await api.read();
  await expect(api.commit({
    requestId: '10000000-0000-4000-8000-000000000003',
    changes: [{ kind: 'daily', id: 'one', schemaVersion: 1, expectedVersion: 1, data: updated.data }],
  })).rejects.toThrow('lost ACK');
  expect(await api.read()).toEqual([updated]);
  expect(new Headers(requests[3].headers).has('If-None-Match')).toBe(false);
});
