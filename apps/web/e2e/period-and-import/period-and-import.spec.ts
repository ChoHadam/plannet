import { test, expect, Page } from '@playwright/test';
import type { MonthlyData } from '../../src/types/monthly';
import type { DailyData } from '../../src/types/daily';
import { GRID_POSITIONS, MandalartData } from '../../src/types/mandalart';

const TIMESTAMP = '2024-01-01T00:00:00.000Z';
const MONTHLY_KEY = 'plannet-monthly';
const DAILY_KEY = 'plannet-daily';
const MANDALART_KEY = 'plannet-mandalart';
function monthly(id: string, year: number, month: number, createdAt = TIMESTAMP): MonthlyData {
  return { id, title: id, template: 'monthly', category: 'monthly', year, month,
    goals: [{ id: `${id}-goal`, text: `${id} 목표`, progress: 25, completed: false }],
    weeklyFocus: [1, 2, 3, 4, 5].map((weekNumber) => ({ weekNumber, text: `${id} W${weekNumber}` })),
    memo: `${id} 메모`, createdAt, updatedAt: TIMESTAMP };
}
function daily(id: string, year: number, month: number, day: number, createdAt = TIMESTAMP): DailyData {
  return { id, title: id, template: 'daily', category: 'daily', year, month, day,
    todos: [{ id: `${id}-todo`, text: `${id} 할 일`, completed: false }],
    memo: `${id} 메모`, createdAt, updatedAt: TIMESTAMP };
}
function mandalart(id: string): MandalartData {
  return { id, title: id, template: 'mandalart', category: 'annual', year: 2024,
    createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
    grids: GRID_POSITIONS.map((grid) => ({ id: grid, color: '#DBEAFE',
      cells: Array.from({ length: 9 }, (_, position) => ({
        id: `${grid}-${position}`, position,
        value: grid === 'center' && position === 4 ? `${id} 핵심` :
          (grid === 'center' && position === 0) || (grid === 'top-left' && position === 4) ? `${id} 분야` :
          grid === 'top-left' && position === 0 ? `${id} 실천` : '',
        ...(grid === 'top-left' && position === 0 ? { schedule: { targetMonths: [2] } } : {}),
      })),
    })),
  };
}
async function seed(page: Page, options: {
  monthly?: MonthlyData[]; daily?: DailyData[]; mandalarts?: MandalartData[];
  monthlyId?: string; dailyId?: string; suffix?: string;
}) {
  await page.goto('/');
  await expect(page.locator('aside')).toBeVisible();
  await page.evaluate(({ options, keys }) => {
    const suffix = options.suffix ?? '';
    localStorage.setItem(keys.monthly + suffix, JSON.stringify({ version: 1, state: {
      monthlyPlans: options.monthly ?? [], currentMonthlyId: options.monthlyId ?? null,
    } }));
    localStorage.setItem(keys.daily + suffix, JSON.stringify({ version: 0, state: {
      dailyPlans: options.daily ?? [], currentDailyId: options.dailyId ?? null,
    } }));
    localStorage.setItem(keys.mandalart + suffix, JSON.stringify({ version: 3, state: {
      mandalarts: options.mandalarts ?? [], currentId: null,
    } }));
  }, { options, keys: { monthly: MONTHLY_KEY, daily: DAILY_KEY, mandalart: MANDALART_KEY } });
  await page.reload();
  await expect(page.locator('aside')).toBeVisible();
}
async function stored<T>(page: Page, key: string): Promise<T> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
const monthlyState = (page: Page) => stored<{ monthlyPlans: MonthlyData[]; currentMonthlyId: string | null; viewedMonth?: unknown }>(page, MONTHLY_KEY);
const dailyState = (page: Page) => stored<{ dailyPlans: DailyData[]; currentDailyId: string | null; viewedDay?: unknown }>(page, DAILY_KEY);
const monthlyTitle = (page: Page) => page.getByPlaceholder('나의 월간 플래너');
const dailyTitle = (page: Page) => page.getByPlaceholder('나의 투두리스트');

test('Monthly browses year boundary, stable duplicate choice, empty period and reload without mutating plans', async ({ page }) => {
  const plans = [monthly('December', 2023, 12), monthly('January-old', 2024, 1),
    monthly('January-b', 2024, 1, '2024-01-03T00:00:00.000Z'), monthly('January-a', 2024, 1, '2024-01-03T00:00:00.000Z')];
  await seed(page, { monthly: plans, monthlyId: 'December' });
  await expect(monthlyTitle(page)).toHaveValue('December');
  await page.getByTitle('다음 달', { exact: true }).click();
  await expect(monthlyTitle(page)).toHaveValue('January-a');
  await expect(page.getByRole('heading', { name: '2024년 1월', exact: true })).toBeVisible();
  await expect(page.getByTitle('플랜 날짜 변경')).toHaveText('2024년 1월');
  await expect(page.getByPlaceholder('자유롭게 메모하세요...')).toHaveValue('January-a 메모');
  await page.getByTitle('다음 달', { exact: true }).click();
  await expect(page.getByText('이 달에는 월간 플랜이 없습니다')).toBeVisible();
  await expect(monthlyTitle(page)).toHaveCount(0);
  await expect(page.getByText('January-a 목표', { exact: true })).toHaveCount(0);
  expect((await monthlyState(page)).monthlyPlans).toEqual(plans);
  expect((await monthlyState(page)).currentMonthlyId).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: '2024년 2월', exact: true })).toBeVisible();
  await page.getByTitle('이전 달', { exact: true }).click();
  await expect(monthlyTitle(page)).toHaveValue('January-a');
  expect((await monthlyState(page)).monthlyPlans).toEqual(plans);
  await page.getByTitle('다음 달', { exact: true }).click();
  await page.getByRole('button', { name: '이 달의 플랜 만들기' }).click();
  const after = (await monthlyState(page)).monthlyPlans;
  expect(after).toHaveLength(plans.length + 1);
  expect(after.filter((p) => plans.some((old) => old.id === p.id))).toEqual(plans);
  expect(after[0]).toMatchObject({ year: 2024, month: 2, goals: [], memo: '' });
});

test('Daily leap day and duplicates keep all dates, contents and timestamps; empty create is explicit', async ({ page }) => {
  const otherCategory = { ...daily('other-category', 2024, 2, 29, '2025-01-01T00:00:00.000Z'), category: 'annual' as const };
  const plans = [daily('February28', 2024, 2, 28), daily('Leap-old', 2024, 2, 29),
    daily('Leap-b', 2024, 2, 29, '2024-02-01T00:00:00.000Z'), daily('Leap-a', 2024, 2, 29, '2024-02-01T00:00:00.000Z'), otherCategory];
  await seed(page, { daily: plans, dailyId: 'February28' });
  await page.getByTitle('다음 날', { exact: true }).click();
  await expect(dailyTitle(page)).toHaveValue('Leap-a');
  await expect(page.getByRole('heading', { name: '2024년 2월 29일 (목)' })).toBeVisible();
  await expect(page.getByTitle('플랜 날짜 변경')).toHaveText('2024년 2월 29일');
  await page.getByPlaceholder('할 일을 입력하세요...').fill('버려지는 임시 입력');
  await page.getByTitle('다음 날', { exact: true }).click();
  await expect(page.getByText('이 날에는 일간 플랜이 없습니다')).toBeVisible();
  await expect(dailyTitle(page)).toHaveCount(0);
  expect((await dailyState(page)).dailyPlans).toEqual(plans);
  await page.reload();
  await expect(page.getByRole('heading', { name: '2024년 3월 1일 (금)' })).toBeVisible();
  await page.getByTitle('이전 날', { exact: true }).click();
  await expect(dailyTitle(page)).toHaveValue('Leap-a');
  await expect(page.getByPlaceholder('할 일을 입력하세요...')).toHaveValue('');
  await page.getByTitle('다음 날', { exact: true }).click();
  await page.getByRole('button', { name: '이 날의 플랜 만들기' }).click();
  const after = (await dailyState(page)).dailyPlans;
  expect(after.slice(0, plans.length)).toEqual(plans);
  expect(after).toHaveLength(plans.length + 1);
  expect(after.at(-1)).toMatchObject({ year: 2024, month: 3, day: 1, todos: [], memo: '' });
});

test('Daily year boundary and non-leap February navigation are read-only', async ({ page }) => {
  const plans = [daily('year-end', 2023, 12, 31), daily('new-year', 2024, 1, 1), daily('normal-Feb', 2023, 2, 28)];
  await seed(page, { daily: plans, dailyId: 'year-end' });
  await page.getByTitle('다음 날', { exact: true }).click();
  await expect(dailyTitle(page)).toHaveValue('new-year');
  await page.getByTitle('이전 날', { exact: true }).click();
  await expect(dailyTitle(page)).toHaveValue('year-end');
  await page.locator('aside').getByText('normal-Feb', { exact: true }).click();
  await page.getByTitle('다음 날', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '2023년 3월 1일 (수)' })).toBeVisible();
  expect((await dailyState(page)).dailyPlans).toEqual(plans);
});

test('Explicit Monthly date reassignment updates only selected plan and does not merge duplicates', async ({ page }) => {
  const plans = [monthly('move-me', 2024, 1), monthly('keep-me', 2024, 2)];
  await seed(page, { monthly: plans, monthlyId: 'move-me' });
  await page.getByTitle('플랜 날짜 변경').click();
  await page.getByRole('button', { name: '2월', exact: true }).click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await expect(monthlyTitle(page)).toHaveValue('move-me');
  await expect(page.getByRole('heading', { name: '2024년 2월', exact: true })).toBeVisible();
  const after = (await monthlyState(page)).monthlyPlans;
  expect(after).toHaveLength(2);
  expect(after[1]).toEqual(plans[1]);
  expect(after[0]).toEqual({ ...plans[0], month: 2, updatedAt: after[0].updatedAt });
  expect(after[0].updatedAt).not.toBe(TIMESTAMP);
  await page.getByTitle('플랜 날짜 변경').click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  expect((await monthlyState(page)).monthlyPlans).toEqual(after);
});

test('Daily header and date picker agree for non-daily categories and clamp carried leap day', async ({ page }) => {
  const plan = { ...daily('annual-todos', 2024, 2, 29), category: 'annual' as const };
  await seed(page, { daily: [plan], dailyId: plan.id });
  await expect(page.getByTitle('플랜 날짜 변경')).toHaveText('2024년 2월 29일');
  await page.getByTitle('플랜 날짜 변경').click();
  const picker = page.getByRole('heading', { name: '날짜 선택' }).locator('..');
  await picker.getByRole('button').nth(1).click();
  await picker.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2025년 2월 28일 (금)' })).toBeVisible();
  const changed = (await dailyState(page)).dailyPlans[0];
  expect(changed).toEqual({ ...plan, year: 2025, day: 28, updatedAt: changed.updatedAt });
});

test('Switching templates clears empty-period cursor and preserves exclusive selection', async ({ page }) => {
  await seed(page, { monthly: [monthly('month-plan', 2024, 2)], monthlyId: 'month-plan', daily: [daily('day-plan', 2024, 2, 29)] });
  await page.getByTitle('다음 달', { exact: true }).click();
  await expect(page.getByText('이 달에는 월간 플랜이 없습니다')).toBeVisible();
  await page.locator('aside').getByText('day-plan', { exact: true }).click();
  await expect(dailyTitle(page)).toHaveValue('day-plan');
  expect((await monthlyState(page)).viewedMonth).toBeNull();
  await page.getByTitle('다음 날', { exact: true }).click();
  await page.locator('aside').getByText('month-plan', { exact: true }).click();
  await expect(monthlyTitle(page)).toHaveValue('month-plan');
  expect((await dailyState(page)).viewedDay).toBeNull();
  expect((await dailyState(page)).currentDailyId).toBeNull();
  await page.reload();
  await expect(monthlyTitle(page)).toHaveValue('month-plan');
});

test('Monthly imports repeated cell IDs from multiple sources once each and completion touches only chosen original', async ({ page }) => {
  const sources = [mandalart('Source-A'), mandalart('Source-B')];
  const target = { ...monthly('Import-target', 2024, 2), goals: [] };
  await seed(page, { monthly: [target], monthlyId: target.id, mandalarts: sources });
  await page.getByRole('button', { name: '만다라트에서 불러오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '만다라트에서 목표 불러오기' });
  await dialog.getByRole('checkbox', { name: /Source-A 실천/ }).first().check();
  await expect(dialog.getByRole('checkbox', { name: /Source-A 실천/ }).nth(1)).toBeChecked();
  await dialog.getByRole('checkbox', { name: /Source-B 실천/ }).check();
  await dialog.getByRole('button', { name: '2개 불러오기' }).click();
  const goals = (await monthlyState(page)).monthlyPlans[0].goals;
  expect(goals).toHaveLength(2);
  expect(goals.map((goal) => [goal.text, goal.sourceMandalartId, goal.sourceCellId])).toEqual([
    ['Source-A 실천', 'Source-A', 'top-left-0'], ['Source-B 실천', 'Source-B', 'top-left-0'],
  ]);
  await page.getByText('Source-B 실천', { exact: true }).locator('..').locator('..').getByRole('button').first().click();
  await page.getByRole('button', { name: '둘 다 완료', exact: true }).click();
  let original = (await stored<{ mandalarts: MandalartData[] }>(page, MANDALART_KEY)).mandalarts;
  expect(original[0]).toEqual(sources[0]);
  expect(original[1].grids.find((g) => g.id === 'top-left')!.cells[0].completed).toBe(true);
  await page.getByText('Source-A 실천', { exact: true }).locator('..').locator('..').getByRole('button').first().click();
  await page.getByRole('button', { name: '월간만 완료', exact: true }).click();
  original = (await stored<{ mandalarts: MandalartData[] }>(page, MANDALART_KEY)).mandalarts;
  expect(original[0]).toEqual(sources[0]);
  await page.getByRole('button', { name: '만다라트에서 불러오기', exact: true }).click();
  for (const box of await dialog.getByRole('checkbox').all()) await expect(box).toBeDisabled();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await page.reload();
  expect((await monthlyState(page)).monthlyPlans[0].goals.map((g) => g.sourceMandalartId)).toEqual(['Source-A', 'Source-B']);
});

test('Recommendations remain selectable when current dropdown source has no grouped actions', async ({ page }) => {
  const empty = { ...mandalart('Empty'), grids: mandalart('Empty').grids.map((g) => ({ ...g, cells: g.cells.map((c) => ({ ...c, value: '' })) })) };
  const target = { ...monthly('Import-target', 2024, 2), goals: [] };
  await seed(page, { monthly: [target], monthlyId: target.id, mandalarts: [empty, mandalart('Source-B')] });
  await page.getByRole('button', { name: '만다라트에서 불러오기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '만다라트에서 목표 불러오기' });
  await expect(dialog.getByRole('combobox')).toHaveValue('Empty');
  await dialog.getByRole('checkbox', { name: /Source-B 실천/ }).check();
  await dialog.getByRole('button', { name: '1개 불러오기' }).click();
  expect((await monthlyState(page)).monthlyPlans[0].goals[0]).toMatchObject({ sourceMandalartId: 'Source-B', sourceCellId: 'top-left-0' });
});

test('Logged-in service loads each account only from the DB; the period cursor is not persisted in the browser', async ({ page }) => {
  // 로그인한 서비스 모드는 기록·조회 커서를 브라우저에 저장하지 않는다. 계정별 기록은 (모의) DB에서만 온다.
  let subject = 'account-a';
  const userIds: Record<string, string> = { 'account-a': 'aaaaaaaa-0000-4000-8000-00000000000a', 'account-b': 'bbbbbbbb-0000-4000-8000-00000000000b' };
  const plan = monthly('private-A', 2024, 2);
  const db: Record<string, unknown[]> = {
    'account-a': [{ kind: 'monthly', id: plan.id, schemaVersion: 1, version: 1, deleted: false, data: plan, updatedAt: plan.updatedAt }],
    'account-b': [],
  };
  await page.route('**/api/runtime-config', (route) => route.fulfill({ json: { authEnabled: true, backupEnabled: false } }));
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: {
    authenticated: true, storageEnabled: true, user: { authProvider: 'google', externalSubject: subject, name: subject, userId: userIds[subject] },
  } }));
  await page.route('**/api/v1/planner', (route) => route.request().headers()['x-plannet-user-id'] === userIds[subject]
    ? route.fulfill({ json: { userId: userIds[subject], records: db[subject] } })
    : route.fulfill({ status: 409, json: { error: 'account_changed' } }));
  const commits: string[] = [];
  await page.route('**/api/v1/planner/commit', (route) => { commits.push(route.request().postData() ?? ''); return route.fulfill({ status: 500, json: { error: 'unexpected' } }); });

  await page.goto('/');
  await page.locator('aside').getByText('private-A', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '2024년 2월', exact: true })).toBeVisible();
  await page.getByTitle('다음 달', { exact: true }).click();
  await expect(page.getByText('이 달에는 월간 플랜이 없습니다')).toBeVisible();

  subject = 'account-b';
  await page.reload();
  await expect(page.getByText('account-b', { exact: true })).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.locator('aside').getByText('private-A', { exact: true })).toHaveCount(0);

  subject = 'account-a';
  await page.reload();
  await expect(page.locator('aside').getByText('private-A', { exact: true })).toBeVisible();
  // 커서는 저장하지 않았으므로 복원되지 않는다. 플랜을 다시 열면 DB 내용 그대로다.
  await expect(page.getByText('이 달에는 월간 플랜이 없습니다')).toHaveCount(0);
  await page.locator('aside').getByText('private-A', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '2024년 2월', exact: true })).toBeVisible();
  expect(commits).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('plannet')))).toEqual([]);
});
