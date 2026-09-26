import { test, expect, Page } from '@playwright/test';
import { PlannerCommit, PlannerRecord, recordKey, syncStorageKey } from '../../src/lib/plannerSync';
import { createPlan } from '../support/helpers';

const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-26T00:00:00.000Z';
function daily(title = '서버 플랜', id = 'daily-one'): PlannerRecord {
  return { kind: 'daily', id, schemaVersion: 1, version: 1, deleted: false, updatedAt: timestamp, data: {
    id, template: 'daily', category: 'daily', title, year: 2026, month: 9, day: 26, todos: [], memo: '', createdAt: timestamp, updatedAt: timestamp,
  } };
}

async function mockStorage(page: Page, initial: PlannerRecord[] = [daily()]) {
  const records = new Map(initial.map((record) => [recordKey(record), record]));
  const replies = new Map<string, PlannerRecord[]>();
  const requests: PlannerCommit[] = [];
  let sessionUser = USER;
  let offline = false;
  let loseAck = false;
  let readGate: Promise<void> | null = null;
  let commitGate: Promise<void> | null = null;
  let enabled: boolean | undefined = true;
  await page.route('**/api/runtime-config', (route) => route.fulfill({ json: { authEnabled: true, backupEnabled: false } }));
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: {
    authenticated: true, storageEnabled: enabled,
    user: { authProvider: 'google', externalSubject: sessionUser === USER ? 'alice' : 'bob', userId: sessionUser, name: '테스트 계정' },
  } }));
  await page.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'fake-csrf' } }));
  await page.route('**/api/v1/planner', async (route) => {
    if (readGate) await readGate;
    if (offline) return route.abort('failed');
    if (route.request().headers()['x-plannet-user-id'] !== sessionUser) return route.fulfill({ status: 409, json: { error: 'account_changed' } });
    await route.fulfill({ json: { userId: sessionUser, records: [...records.values()] } });
  });
  await page.route('**/api/v1/planner/commit', async (route) => {
    const body = route.request().postDataJSON() as PlannerCommit;
    requests.push(body);
    if (commitGate) await commitGate;
    if (offline) return route.abort('failed');
    if (route.request().headers()['x-plannet-user-id'] !== sessionUser) return route.fulfill({ status: 409, json: { error: 'account_changed' } });
    expect(route.request().headers()['x-csrf-token']).toBe('fake-csrf');
    if (replies.has(body.requestId)) return route.fulfill({ json: { records: replies.get(body.requestId) } });
    if (body.changes.some((change) => change.expectedVersion !== (records.get(recordKey(change))?.version ?? 0))) {
      return route.fulfill({ status: 409, json: { error: 'version_conflict', conflicts: [] } });
    }
    const result: PlannerRecord[] = body.changes.map((change) => ({ ...change, version: change.expectedVersion + 1, deleted: change.data === null, updatedAt: timestamp }));
    result.forEach((record) => records.set(recordKey(record), record));
    replies.set(body.requestId, result);
    if (loseAck) { loseAck = false; return route.abort('failed'); }
    await route.fulfill({ json: { records: result } });
  });
  return {
    records, requests,
    setOffline: (value: boolean) => { offline = value; },
    setSession: (value: string) => { sessionUser = value; },
    loseNextAck: () => { loseAck = true; },
    blockRead: (gate: Promise<void>) => { readGate = gate; },
    blockCommit: (gate: Promise<void> | null) => { commitGate = gate; },
    legacyMode: () => { enabled = undefined; },
  };
}
const status = (page: Page) => page.getByTestId('storage-sync-status');
async function openDaily(page: Page, title = '서버 플랜') {
  await expect(page.locator('aside')).toBeVisible();
  await page.locator('aside').getByText(title, { exact: true }).click();
  await expect(page.getByPlaceholder('나의 투두리스트')).toHaveValue(title);
}

test('initial GET gates editors, restores server data, and does not invent an empty save', async ({ page }) => {
  const api = await mockStorage(page);
  let release!: () => void;
  api.blockRead(new Promise<void>((resolve) => { release = resolve; }));
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-phase', 'loading');
  await expect(page.locator('aside')).toHaveCount(0);
  expect(api.requests).toHaveLength(0);
  release();
  await openDaily(page);
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  // Current selection is device state, never part of a server mutation.
  await page.waitForTimeout(800);
  expect(api.requests).toHaveLength(0);
});

test('cached account reload also keeps editors gated until its fresh GET completes', async ({ page }) => {
  const api = await mockStorage(page);
  await page.goto('/');
  await openDaily(page);
  let release!: () => void;
  api.blockRead(new Promise<void>((resolve) => { release = resolve; }));
  await page.reload();
  await expect(status(page)).toHaveAttribute('data-phase', 'loading');
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.getByPlaceholder('오늘의 메모...')).toHaveCount(0);
  expect(api.requests).toHaveLength(0);
  release();
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  await expect(page.getByPlaceholder('나의 투두리스트')).toHaveValue('서버 플랜');
});

test('lost ACK reload replays same request and restores server data after local cache is removed', async ({ page }) => {
  const api = await mockStorage(page);
  await page.goto('/');
  await openDaily(page);
  api.loseNextAck();
  await page.getByPlaceholder('오늘의 메모...').fill('응답이 유실된 수정');
  await expect(status(page)).toHaveAttribute('data-phase', 'error');
  const first = api.requests[0];
  await page.reload();
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  expect(api.requests[1]).toEqual(first);
  await expect(page.getByPlaceholder('오늘의 메모...')).toHaveValue('응답이 유실된 수정');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await openDaily(page);
  await expect(page.getByPlaceholder('오늘의 메모...')).toHaveValue('응답이 유실된 수정');
});

test('new typing during delayed ACK survives and becomes the next server version', async ({ page }) => {
  const api = await mockStorage(page);
  await page.goto('/');
  await openDaily(page);
  let release!: () => void;
  api.blockCommit(new Promise<void>((resolve) => { release = resolve; }));
  const memo = page.getByPlaceholder('오늘의 메모...');
  await memo.fill('첫 수정');
  await expect.poll(() => api.requests.length).toBe(1);
  await memo.fill('전송 중에 새로 쓴 내용');
  api.blockCommit(null);
  release();
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  await expect(memo).toHaveValue('전송 중에 새로 쓴 내용');
  expect(api.records.get('daily:daily-one')?.data?.memo).toBe('전송 중에 새로 쓴 내용');
  expect(api.records.get('daily:daily-one')?.version).toBe(3);
});

test('conflict draft is downloadable across reload and latest-server choice archives it', async ({ page }) => {
  const api = await mockStorage(page);
  await page.goto('/');
  await openDaily(page);
  api.records.set('daily:daily-one', { ...daily(), version: 2, data: { ...daily().data!, memo: '다른 기기 수정' } });
  await page.getByPlaceholder('오늘의 메모...').fill('이 기기 초안');
  await expect(status(page)).toHaveAttribute('data-phase', 'conflict');
  const download = page.waitForEvent('download');
  await page.getByTestId('storage-sync-download').click();
  expect((await download).suggestedFilename()).toMatch(/^plannet-draft-/);
  await page.reload();
  await expect(status(page)).toHaveAttribute('data-phase', 'conflict');
  await expect(page.getByPlaceholder('오늘의 메모...')).toHaveValue('이 기기 초안');
  await page.getByTestId('storage-sync-use-server').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  await expect(page.getByPlaceholder('오늘의 메모...')).toHaveValue('다른 기기 수정');
  expect(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.includes(':backup:') && value.includes('이 기기 초안')))).toBe(true);
});

test('an offline first load stays gated; retry loads data and account switch rejects stale-tab writes', async ({ page }) => {
  const api = await mockStorage(page);
  api.setOffline(true);
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-phase', 'error');
  await expect(page.locator('aside')).toHaveCount(0);
  api.setOffline(false);
  await page.getByRole('button', { name: '서버 저장 다시 시도' }).click();
  await openDaily(page);
  api.setSession(OTHER);
  await page.getByPlaceholder('오늘의 메모...').fill('계정 전환 후 남은 초안');
  await expect(status(page)).toHaveAttribute('data-phase', 'error');
  await expect(status(page)).toContainText('로그인 계정이 바뀌었어요');
  expect(api.records.get('daily:daily-one')?.data?.memo).toBe('');
  expect(await page.evaluate((key) => localStorage.getItem(key), syncStorageKey(USER))).toContain('계정 전환 후 남은 초안');
});

test('explicit imports retain original keys and references; collisions do not overwrite', async ({ page }) => {
  const api = await mockStorage(page, []);
  await page.addInitScript(({ anonymous, legacy }) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('plannet-daily', JSON.stringify({ version: 0, state: { dailyPlans: [anonymous] } }));
      localStorage.setItem('plannet-daily@acct:google%3Aalice', JSON.stringify({ version: 0, state: { dailyPlans: [legacy] } }));
      localStorage.setItem('seeded', 'yes');
    }
  }, { anonymous: { ...daily('로그인 전 플랜').data!, todos: [{ id: 'task', text: '이전한 목표', completed: false, sourceType: 'monthly', sourceId: 'monthly-source', sourceCellId: 'goal-source' }] }, legacy: daily('이전 계정의 같은 ID').data });
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  expect(api.records.size).toBe(0);
  await page.getByTestId('storage-sync-import-local').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'saved');
  expect(api.records.get('daily:daily-one')?.data?.todos).toEqual([{ id: 'task', text: '이전한 목표', completed: false, sourceType: 'monthly', sourceId: 'monthly-source', sourceCellId: 'goal-source' }]);
  await page.getByTestId('storage-sync-import-legacy').click();
  await expect(page.getByText(/가져오기를 중단했어요/)).toBeVisible();
  expect(api.records.get('daily:daily-one')?.data?.title).toBe('로그인 전 플랜');
  expect(await page.evaluate(() => localStorage.getItem('plannet-daily@acct:google%3Aalice'))).toContain('이전 계정의 같은 ID');
  await page.getByTestId('storage-sync-import-local').click();
  await expect(page.getByText(/같은 내용 1개는 건너뛰었어요/)).toBeVisible();
});

test('missing storage flag preserves existing account-local behavior', async ({ page }) => {
  const api = await mockStorage(page, []);
  api.legacyMode();
  await page.goto('/');
  await createPlan(page, '투두리스트', 3);
  await page.getByPlaceholder('나의 투두리스트').fill('기존 로컬 모드');
  await expect(status(page)).toHaveCount(0);
  expect(api.requests).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('plannet-daily@acct:google%3Aalice'))).toContain('기존 로컬 모드');
});
