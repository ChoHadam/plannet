import { randomUUID } from 'node:crypto';
import { expect, test, Page, Browser } from '@playwright/test';
import { dismissGuide } from '../support/helpers';
import { planFixture } from '../mandalart-io/fixtures';
import { HOST, ORIGIN, PORTS } from './config.mjs';

interface StoredRecord {
  kind: string; id: string; version: number; schemaVersion: number;
  data: Record<string, unknown> | null; deleted: boolean;
}
const timestamp = '2026-09-26T00:00:00.000Z';
const titleInput = (page: Page) => page.getByPlaceholder('나의 투두리스트');
async function login(page: Page, account: 'alice' | 'bob' = 'alice') {
  await page.goto(ORIGIN);
  await page.getByRole('button', { name: 'Google 로그인', exact: true }).first().click();
  await page.getByRole('button', { name: account === 'alice' ? 'Alice로 로그인' : 'Bob으로 로그인' }).click();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  const response = await page.request.get(`${ORIGIN}/api/v1/me`);
  const body = await response.json();
  expect(body.storageEnabled).toBe(true);
  expect(body.user.userId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByTestId('storage-sync-status')).toBeVisible();
  return body.user.userId as string;
}
async function records(page: Page, userId: string): Promise<StoredRecord[]> {
  const response = await page.request.get(`${ORIGIN}/api/v1/planner`, { headers: { 'X-Plannet-User-Id': userId } });
  expect(response.status()).toBe(200);
  return (await response.json()).records;
}
async function commit(page: Page, userId: string, changes: object[], requestId = randomUUID()) {
  const csrf = await (await page.request.get(`${ORIGIN}/api/v1/csrf`)).json();
  return page.request.post(`${ORIGIN}/api/v1/planner/commit`, {
    headers: { 'X-Plannet-User-Id': userId, [csrf.headerName]: csrf.token },
    data: { requestId, changes },
  });
}
function daily(id: string, title = id) {
  return { id, title, template: 'daily', category: 'daily', year: 2026, month: 9, day: 26,
    todos: [{ id: `${id}-todo`, text: '서버에 보존할 할 일', completed: false }], memo: '', createdAt: timestamp, updatedAt: timestamp };
}
async function device(browser: Browser, account: 'alice' | 'bob' = 'alice') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const userId = await login(page, account);
  return { context, page, userId };
}
async function openPlan(page: Page, title: string) {
  await page.locator('aside').getByText(title, { exact: true }).click();
  await expect(titleInput(page)).toHaveValue(title);
}

async function createDaily(page: Page) {
  await page.getByRole('button', { name: '새로 만들기', exact: true }).nth(3).click();
  await page.getByRole('button', { name: '투두리스트 추천 간단한 일간 할 일 관리', exact: true }).click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await dismissGuide(page);
}

test('UI autosave reaches PostgreSQL, a new browser restores it, another account cannot see it', async ({ page, browser }) => {
  const userId = await login(page);
  await createDaily(page);
  const title = `기기 간 복원 ${randomUUID()}`;
  await titleInput(page).fill(title);
  const todo = page.getByPlaceholder('할 일을 입력하세요...');
  await todo.fill('다른 기기에서도 보이는 기록');
  await todo.press('Enter');
  await expect.poll(async () => (await records(page, userId)).find(record => record.data?.title === title)?.data?.todos).toEqual(
    expect.arrayContaining([expect.objectContaining({ text: '다른 기기에서도 보이는 기록' })]),
  );
  const remote = await device(browser);
  const other = await device(browser, 'bob');
  try {
    expect(remote.userId).toBe(userId);
    await openPlan(remote.page, title);
    await expect(remote.page.getByText('다른 기기에서도 보이는 기록', { exact: true })).toBeVisible();
    expect((await records(other.page, other.userId)).some(record => record.data?.title === title)).toBe(false);
    const staleRead = await other.page.request.get(`${ORIGIN}/api/v1/planner`, { headers: { 'X-Plannet-User-Id': userId } });
    expect(staleRead.status()).toBe(409);
    expect(await staleRead.json()).toMatchObject({ error: 'account_changed' });
    const staleWrite = await commit(other.page, userId, [{ kind: 'daily', id: 'stale-tab', schemaVersion: 1, expectedVersion: 0, data: daily('stale-tab') }]);
    expect(staleWrite.status()).toBe(409);
    expect((await records(other.page, other.userId)).some(record => record.id === 'stale-tab')).toBe(false);
  } finally { await remote.context.close(); await other.context.close(); }
});

test('stale device edits cannot overwrite a newer server version and its draft remains downloadable', async ({ page, browser }) => {
  const userId = await login(page);
  const id = `conflict-${randomUUID()}`;
  const initial = daily(id);
  expect((await commit(page, userId, [{ kind: 'daily', id, schemaVersion: 1, expectedVersion: 0, data: initial }])).status()).toBe(200);
  await page.reload();
  await openPlan(page, id);
  const second = await device(browser);
  try {
    await openPlan(second.page, id);
    const winner = `PC에서 수정 ${id}`;
    await titleInput(page).fill(winner);
    await expect.poll(async () => (await records(page, userId)).find(record => record.id === id)?.data?.title).toBe(winner);
    const loser = `보존할 휴대폰 초안 ${id}`;
    await titleInput(second.page).fill(loser);
    await expect(second.page.getByTestId('storage-sync-status')).toContainText(/충돌|다른 기기/);
    expect((await records(page, userId)).find(record => record.id === id)?.data?.title).toBe(winner);
    await expect(titleInput(second.page)).toHaveValue(loser);
    const downloadEvent = second.page.waitForEvent('download');
    await second.page.getByTestId('storage-sync-download').click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toContain(loser);
    await second.page.reload();
    await expect(second.page.getByTestId('storage-sync-status')).toContainText(/충돌|다른 기기/);
  } finally { await second.context.close(); }
});

test('lost commit acknowledgement survives reload and replays once without duplicating a version', async ({ page }) => {
  const userId = await login(page);
  await createDaily(page);
  const title = `응답 유실 ${randomUUID()}`;
  let lostRequest: { requestId: string; changes: Array<{id: string}> } | undefined;
  let acknowledgedVersion: number | undefined;
  await page.route('**/api/v1/planner/commit', async route => {
    const body = route.request().postDataJSON();
    if (!lostRequest && JSON.stringify(body).includes(title)) {
      lostRequest = body;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      acknowledgedVersion = (await response.json()).records.find((record: StoredRecord) => record.data?.title === title)?.version;
      await route.abort('failed');
    } else await route.continue();
  });
  await titleInput(page).fill(title);
  await expect.poll(() => acknowledgedVersion).toBeDefined();
  await page.reload();
  await expect(page.getByTestId('storage-sync-status')).toHaveAttribute('data-phase', 'saved');
  const saved = (await records(page, userId)).find(record => record.data?.title === title);
  expect(saved?.version).toBe(acknowledgedVersion);
  expect(saved?.id).toBe(lostRequest?.changes.find(change => change.id === saved?.id)?.id);
  expect((await records(page, userId)).filter(record => record.data?.title === title)).toHaveLength(1);
});

test('explicit local import preserves all templates, references and settings without removing the source', async ({ page }) => {
  await page.goto(ORIGIN);
  const suffix = randomUUID();
  const mandalart = { ...planFixture(), id: `import-m-${suffix}`, title: `가져온 만다라트 ${suffix}` };
  const monthly = { id: `import-month-${suffix}`, title: `가져온 월간 ${suffix}`, template: 'monthly', category: 'monthly', year: 2026, month: 9,
    goals: [{ id: 'goal', text: '출처 보존', progress: 0, completed: false, sourceMandalartId: mandalart.id, sourceCellId: 'top-left-0' }],
    weeklyFocus: [1, 2, 3, 4, 5].map(weekNumber => ({ weekNumber, text: '' })), memo: '', createdAt: timestamp, updatedAt: timestamp };
  const day = { ...daily(`import-day-${suffix}`), todos: [{ id: 'todo', text: '월간 출처', completed: false, sourceType: 'monthly', sourceId: monthly.id, sourceCellId: 'goal' }] };
  const block6 = { id: `import-block-${suffix}`, title: `가져온 블록 ${suffix}`, template: 'block6', category: 'weekly', year: 2026, month: 9, week: 4,
    blocks: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].flatMap(day => Array.from({ length: 6 }, (_, i) => ({ id: `${day}-${i + 1}`, day, blockNumber: i + 1, keyword: '', todos: [] }))),
    backlog: [], createdAt: timestamp, updatedAt: timestamp };
  const local = {
    'plannet-mandalart': { version: 3, state: { mandalarts: [mandalart], currentId: null } },
    'plannet-monthly': { version: 1, state: { monthlyPlans: [monthly], currentMonthlyId: null } },
    'plannet-daily': { version: 0, state: { dailyPlans: [day], currentDailyId: null } },
    'plannet-block6': { version: 2, state: { block6Plans: [block6], currentBlock6Id: null } },
    'plannet-recurring': { version: 0, state: { todos: [{ id: 'habit', text: '반복 기록', createdAt: timestamp }] } },
    'plannet-holidays': { version: 1, state: { manualHolidays: { '2026-09-26': { date: '2026-09-26', name: '내 휴일', createdAt: timestamp } } } },
  };
  await page.evaluate(local => { for (const [key, value] of Object.entries(local)) localStorage.setItem(key, JSON.stringify(value)); }, local);
  const userId = await login(page, 'bob');
  expect((await records(page, userId)).some(record => record.id === mandalart.id)).toBe(false);
  await page.getByRole('button', { name: '로그인 전 기록 가져오기', exact: true }).click();
  await expect.poll(async () => (await records(page, userId)).find(record => record.id === day.id)?.data?.todos).toEqual(day.todos);
  const all = await records(page, userId);
  for (const [kind, data] of [['mandalart', mandalart], ['monthly', monthly], ['daily', day], ['block6', block6]] as const) {
    expect(all.find(record => record.kind === kind && record.id === data.id)?.data).toEqual(data);
  }
  expect(all.find(record => record.kind === 'recurring')?.data).toEqual(local['plannet-recurring'].state);
  expect(all.find(record => record.kind === 'holidays')?.data).toEqual(local['plannet-holidays'].state);
  const retained = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, JSON.parse(localStorage.getItem(key)!)])), Object.keys(local));
  expect(retained).toEqual(local);
  const versions = all.map(record => [record.kind, record.id, record.version]);
  await page.getByRole('button', { name: '로그인 전 기록 가져오기', exact: true }).click();
  await expect(page.getByTestId('storage-sync-status')).toHaveAttribute('data-phase', 'saved');
  expect((await records(page, userId)).map(record => [record.kind, record.id, record.version])).toEqual(versions);
});

test('API restart expires sessions but PostgreSQL retains identity and stored plans', async ({ page }) => {
  const userId = await login(page);
  const id = `restart-${randomUUID()}`;
  const data = daily(id);
  expect((await commit(page, userId, [{ kind: 'daily', id, schemaVersion: 1, expectedVersion: 0, data }])).status()).toBe(200);
  const response = await fetch(`http://${HOST}:${PORTS.control}/restart-api`, { method: 'POST' });
  expect(response.status).toBe(200);
  expect((await page.request.get(`${ORIGIN}/api/v1/me`)).status()).toBe(401);
  expect(await login(page)).toBe(userId);
  expect((await records(page, userId)).find(record => record.id === id)?.data).toEqual(data);
  await openPlan(page, id);
  await expect(page.getByText('서버에 보존할 할 일', { exact: true })).toBeVisible();
});

test('a full dump restores identity, records, tombstones and retry receipts to a new database', async ({ page }) => {
  const userId = await login(page);
  const id = `restore-${randomUUID()}`;
  const requestId = randomUUID();
  const changes = [
    { kind: 'daily', id, schemaVersion: 1, expectedVersion: 0, data: daily(id) },
    { kind: 'daily', id: `${id}-deleted`, schemaVersion: 1, expectedVersion: 0, data: null },
  ];
  const committed = await commit(page, userId, changes, requestId);
  expect(committed.status()).toBe(200);
  const receipt = await committed.json();
  const before = await records(page, userId);
  const response = await fetch(`http://${HOST}:${PORTS.control}/restore-database`, { method: 'POST' });
  expect(response.status).toBe(200);
  expect(await login(page)).toBe(userId);
  expect(await records(page, userId)).toEqual(before);
  const replay = await commit(page, userId, changes, requestId);
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(receipt);
  expect(await records(page, userId)).toEqual(before);
  await openPlan(page, id);
});
