import { test, expect, Page, BrowserContext, Locator } from '@playwright/test';
import { DailyData } from '../../src/types/daily';
import { Block6Data, BlockNumber, DAYS_OF_WEEK } from '../../src/types/block6';
import { MonthlyData, WeeklyFocus } from '../../src/types/monthly';

/**
 * 6주인 달의 주차 정합성 (docs/ui-ux-review.md 3순위).
 *
 * - 로그인한 서비스 모드. 인증·DB는 브라우저에서 가로챈 가상 응답이며 실제 서버·계정·DB에 닿지 않는다.
 * - 브라우저 시각은 테스트마다 고정한다(Asia/Seoul).
 */

const OLD = '2026-01-10T00:00:00.000Z';
const ACCOUNT = { userId: 'c3c3c3c3-0000-4000-8000-0000000000c3', name: '가상 사용자 W', email: 'synthetic.weeks@example.test' };

const focus = (count: 5 | 6, prefix: string): WeeklyFocus[] =>
  Array.from({ length: count }, (_, i) => ({ weekNumber: i + 1, text: `${prefix} W${i + 1}` }));
const monthly = (id: string, title: string, year: number, month: number, weeklyFocus: WeeklyFocus[]): MonthlyData => ({
  id, title, template: 'monthly', category: 'monthly', year, month,
  goals: [{ id: `${id}-goal`, text: '가상 월간 목표', progress: 40, completed: false, sourceMandalartId: 'synthetic-source', sourceCellId: 'top-left-1' }],
  weeklyFocus, memo: '가상 메모', createdAt: OLD, updatedAt: OLD,
});
/** 이전(W1~W5) 형식 그대로 저장된 2026년 3월 플랜 */
const LEGACY_MARCH = monthly('mw-legacy-march', '이전 3월', 2026, 3, focus(5, '이전'));
/** W1~W6이 모두 채워진 2026년 3월 플랜 */
const SIX_MARCH = monthly('mw-six-march', '여섯 주 3월', 2026, 3, focus(6, '여섯'));
const BLOCK6_W6: Block6Data = {
  id: 'mw-block6', title: '3월 W6 주간', template: 'block6', category: 'weekly', year: 2026, month: 3, week: 6,
  blocks: DAYS_OF_WEEK.flatMap((day) => ([1, 2, 3, 4, 5, 6] as BlockNumber[]).map((blockNumber) => ({ id: `${day}-${blockNumber}`, day, blockNumber, keyword: '', todos: [] }))),
  backlog: [], createdAt: OLD, updatedAt: OLD,
};
const DAILY_0330: DailyData = {
  id: 'mw-daily', title: '3월 30일', template: 'daily', category: 'daily', year: 2026, month: 3, day: 30,
  todos: [], memo: '', createdAt: OLD, updatedAt: OLD,
};

type Plan = MonthlyData | Block6Data | DailyData;
interface StoredRecord { kind: string; id: string; schemaVersion: 1; version: number; deleted: boolean; data: unknown; updatedAt: string }
interface Change { kind: string; id: string; expectedVersion: number; data: Record<string, unknown> | null }
interface Harness { db: Map<string, StoredRecord>; commits: Change[][]; unexpected: string[] }

async function setup(context: BrowserContext, plans: Plan[], now: Date): Promise<Harness> {
  const harness: Harness = { db: new Map(), commits: [], unexpected: [] };
  for (const plan of plans) {
    harness.db.set(`${plan.template}:${plan.id}`, { kind: plan.template, id: plan.id, schemaVersion: 1, version: 3, deleted: false, data: plan, updatedAt: plan.updatedAt });
  }
  await context.clock.setFixedTime(now);
  // 나중에 등록한 route가 먼저 처리된다. 알 수 없는 API·외부 요청은 막고 기록한다.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      harness.unexpected.push(url.origin);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      harness.unexpected.push(url.pathname);
      return route.fulfill({ status: 503, json: { error: 'blocked_in_test' } });
    }
    return route.continue();
  });
  await context.route('**/api/runtime-config', (route) => route.fulfill({ json: { authEnabled: true, backupEnabled: false } }));
  await context.route('**/api/v1/me', (route) => route.fulfill({
    json: {
      authenticated: true, storageEnabled: true,
      user: { authProvider: 'google', externalSubject: 'weeks-synthetic', name: ACCOUNT.name, email: ACCOUNT.email, userId: ACCOUNT.userId },
    },
  }));
  await context.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-MW-CSRF', token: 'mw-token' } }));
  await context.route('**/api/v1/planner', (route) => {
    if (route.request().headers()['x-plannet-user-id'] !== ACCOUNT.userId) return route.fulfill({ status: 409, json: { error: 'account_changed' } });
    return route.fulfill({ json: { userId: ACCOUNT.userId, records: [...harness.db.values()] } });
  });
  await context.route('**/api/v1/planner/commit', (route) => {
    const { changes } = route.request().postDataJSON() as { changes: Change[] };
    harness.commits.push(changes);
    const saved = changes.map((change) => {
      const current = harness.db.get(`${change.kind}:${change.id}`);
      // 실제 API처럼 버전이 다르면 충돌로 거절한다.
      if ((current?.version ?? 0) !== change.expectedVersion) throw new Error(`version mismatch ${change.id}`);
      return { kind: change.kind, id: change.id, schemaVersion: 1 as const, version: change.expectedVersion + 1, deleted: change.data === null, data: change.data, updatedAt: now.toISOString() };
    });
    saved.forEach((record) => harness.db.set(`${record.kind}:${record.id}`, record));
    return route.fulfill({ json: { records: saved } });
  });
  return harness;
}

const titleInput = (page: Page) => page.locator('header input').first();
const changes = (harness: Harness) => harness.commits.flat();
const stored = (harness: Harness, kind: string, id: string) => harness.db.get(`${kind}:${id}`)!;
const calendarDays = (page: Page, week: number) => page.locator(`main [data-week="${week}"]`);
const focusRow = (page: Page, week: number) => page.getByTestId(`weekly-focus-W${week}`);
const focusList = (page: Page) => page.getByRole('list', { name: '주차별 포커스' });
const RETAINED = '이 달에 없는 주 · 보관된 내용';

async function open(page: Page, plan: Plan) {
  await page.goto(`/?template=${plan.template}&plan=${plan.id}`);
  await expect(titleInput(page)).toHaveValue(plan.title);
}

async function centerX(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return box.x + box.width / 2;
}

/** 같은 요일 열인지(소수점 배치 오차 1px 이내) */
async function expectSameColumn(a: Locator, b: Locator) {
  expect(Math.abs(await centerX(a) - await centerX(b))).toBeLessThanOrEqual(1);
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** 기록 외의 모든 필드(목표·메모·제목·카테고리·출처·생성 시각)가 그대로인지 */
function expectOnlyFocusChanged(data: Record<string, unknown>, original: MonthlyData) {
  const omit = (value: object) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'weeklyFocus' && key !== 'updatedAt'));
  expect(omit(data)).toEqual(omit(original));
}

test.describe('Monthly 달력·주간 포커스의 공통 주차', () => {
  for (const width of [360, 768, 1440]) {
    test(`${width}px: 이전 5개 플랜의 2026년 3월은 월~일 6행(W6=30·31일)이고 읽기·새로고침만으로 저장하지 않는다`, async ({ context, page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const harness = await setup(context, [LEGACY_MARCH], new Date('2026-03-30T10:00:00+09:00'));
      await open(page, LEGACY_MARCH);

      // 행 = 공통 주차. W1은 3/1(일) 하루, W6은 30·31일
      await expect(calendarDays(page, 1)).toHaveText(['1']);
      await expect(calendarDays(page, 2)).toHaveText(['2', '3', '4', '5', '6', '7', '8']);
      await expect(calendarDays(page, 6)).toHaveText(['30', '31']);
      await expect(calendarDays(page, 7)).toHaveCount(0);
      // 월요일 시작: 3/1(일)은 3/8(일)과 같은 열, 3/2(월)은 첫 열. 일요일은 빨강, 토요일은 파랑
      const day = (n: string) => page.locator('main [data-week]').filter({ hasText: new RegExp(`^${n}$`) });
      await expectSameColumn(day('1'), day('8'));
      await expectSameColumn(day('30'), day('2'));
      expect(await centerX(day('2'))).toBeLessThan(await centerX(day('3')));
      const color = (n: string) => day(n).evaluate((el) => getComputedStyle(el).color);
      // 3/1(삼일절)·3/2(대체공휴일)는 공휴일 색이라 다른 일·토요일로 비교한다
      expect(await color('15')).toBe(await color('22'));
      expect(await color('7')).toBe(await color('14'));
      expect(new Set([await color('15'), await color('7'), await color('10')]).size).toBe(3);

      // 포커스: W1~W5 기존 내용 + 빈 W6 입력 칸. 보관 표시 없음
      for (let week = 1; week <= 5; week++) await expect(focusRow(page, week)).toContainText(`이전 W${week}`);
      await expect(focusRow(page, 6)).toContainText('클릭하여 입력...');
      await expect(focusList(page).getByRole('listitem')).toHaveCount(6);
      await expect(page.getByText(RETAINED)).toHaveCount(0);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`legacy-march-${width}.png`), fullPage: true });

      await page.reload();
      await expect(titleInput(page)).toHaveValue(LEGACY_MARCH.title);
      await page.waitForTimeout(1500);
      expect(harness.commits).toEqual([]);
      expect(stored(harness, 'monthly', LEGACY_MARCH.id).version).toBe(3);
      expect(harness.unexpected).toEqual([]);
    });
  }

  test('이전 5개 플랜에서 W6을 적으면 기존 5개를 그대로 둔 6개를 저장하고, 새로 불러와도 W6이 남는다', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const harness = await setup(context, [LEGACY_MARCH], new Date('2026-03-30T10:00:00+09:00'));
    await open(page, LEGACY_MARCH);

    // 내용을 바꾸지 않고 열었다 닫으면 쓰지 않는다(W2 blur, W6 Esc)
    await focusRow(page, 2).getByRole('button').click();
    await page.getByLabel('W2 포커스').blur();
    await focusRow(page, 6).getByRole('button').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    expect(harness.commits).toEqual([]);

    await focusRow(page, 6).getByRole('button').click();
    const input = page.getByLabel('W6 포커스');
    await input.fill('가상 W6 포커스');
    // 한글 조합 중 Enter는 저장·편집 종료로 처리하지 않는다
    await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
    await expect(input).toBeVisible();
    await input.press('Enter');
    await expect(input).toBeHidden();
    await expect.poll(() => changes(harness).length).toBe(1);
    const [change] = changes(harness);
    expect(change).toMatchObject({ kind: 'monthly', id: LEGACY_MARCH.id, expectedVersion: 3 });
    const focusSaved = change.data!.weeklyFocus as WeeklyFocus[];
    expect(focusSaved).toEqual([...LEGACY_MARCH.weeklyFocus, { weekNumber: 6, text: '가상 W6 포커스' }]);
    expectOnlyFocusChanged(change.data!, LEGACY_MARCH);
    await expect(focusList(page)).toContainText('가상 W6 포커스');

    // 새로 불러오기: DB 기록만으로 W6 복원, 추가 저장 없음
    await page.reload();
    await expect(titleInput(page)).toHaveValue(LEGACY_MARCH.title);
    await expect(focusRow(page, 6)).toContainText('가상 W6 포커스');
    await expect(focusRow(page, 1)).toContainText('이전 W1');
    await page.waitForTimeout(1200);
    expect(changes(harness)).toHaveLength(1);
    expect(stored(harness, 'monthly', LEGACY_MARCH.id).version).toBe(4);
    expect(harness.unexpected).toEqual([]);
  });

  test('6주 → 4주 → 5주 → 6주로 날짜를 옮기고 복제해도 모든 포커스 내용을 보관하고 보여 준다', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const harness = await setup(context, [SIX_MARCH], new Date('2026-03-30T10:00:00+09:00'));
    await open(page, SIX_MARCH);
    const dateButton = page.getByTitle('플랜 날짜 변경');
    const picker = page.getByRole('dialog', { name: '날짜 선택' });
    const reassign = async (yearStep: 'prev' | 'next' | null, monthLabel: string) => {
      await dateButton.click();
      if (yearStep) await picker.getByRole('button').nth(yearStep === 'prev' ? 0 : 1).click();
      await picker.getByRole('button', { name: monthLabel, exact: true }).click();
      await picker.getByRole('button', { name: '확인', exact: true }).click();
      await expect(picker).toBeHidden();
    };
    // 단계마다 저장을 기다린다(자동 저장이 연속 변경을 묶으면 3월로 돌아온 마지막 상태는 변경 없음이 된다)
    const savedPeriod = () => { const data = stored(harness, 'monthly', SIX_MARCH.id).data as MonthlyData; return `${data.year}-${data.month}`; };

    // 2027년 2월(4주): W1~W4 + 보관된 W5·W6(편집 가능, 안내 표시)
    await reassign('next', '2월');
    await expect(dateButton).toHaveText('2027년 2월');
    await expect(calendarDays(page, 5)).toHaveCount(0);
    await expect(focusRow(page, 4)).toContainText('여섯 W4');
    for (const week of [5, 6]) {
      await expect(focusRow(page, week)).toContainText(`여섯 W${week}`);
      await expect(focusRow(page, week)).toContainText(RETAINED);
    }
    await expect(focusList(page).getByText(RETAINED)).toHaveCount(2);
    await expect.poll(savedPeriod).toBe('2027-2');
    await page.screenshot({ path: test.info().outputPath('reassigned-4-weeks-1440.png'), fullPage: true });

    // 2026년 10월(5주): W6만 보관
    await reassign('prev', '10월');
    await expect(dateButton).toHaveText('2026년 10월');
    await expect(focusRow(page, 5)).not.toContainText(RETAINED);
    await expect(focusRow(page, 6)).toContainText(RETAINED);
    await expect.poll(savedPeriod).toBe('2026-10');

    // 다시 2026년 3월(6주): 보관 표시 없이 6주 모두
    await reassign(null, '3월');
    await expect(dateButton).toHaveText('2026년 3월');
    await expect(page.getByText(RETAINED)).toHaveCount(0);
    for (let week = 1; week <= 6; week++) await expect(focusRow(page, week)).toContainText(`여섯 W${week}`);

    await expect.poll(savedPeriod).toBe('2026-3');
    const savedVersion = stored(harness, 'monthly', SIX_MARCH.id).version;
    expect(savedVersion).toBe(6);
    for (const change of changes(harness)) {
      expect(change.data!.weeklyFocus).toEqual(SIX_MARCH.weeklyFocus);
      expectOnlyFocusChanged({ ...change.data!, year: SIX_MARCH.year, month: SIX_MARCH.month }, SIX_MARCH);
    }

    // 4주인 달로 복제: 새 ID·제목, 6개 내용 그대로, 원본은 그대로
    await page.getByRole('button', { name: /^전체 플랜 보기/ }).click();
    await page.getByRole('button', { name: `${SIX_MARCH.title} 복제` }).click();
    await picker.getByRole('button').nth(1).click();
    await picker.getByRole('button', { name: '2월', exact: true }).click();
    await picker.getByRole('button', { name: '확인', exact: true }).click();
    await expect(titleInput(page)).toHaveValue(`${SIX_MARCH.title} (복사)`);
    await expect(dateButton).toHaveText('2027년 2월');
    await expect(focusRow(page, 6)).toContainText(RETAINED);
    await expect.poll(() => changes(harness).filter((change) => change.id !== SIX_MARCH.id).length).toBe(1);
    const copy = changes(harness).find((change) => change.id !== SIX_MARCH.id)!;
    expect(copy).toMatchObject({ kind: 'monthly', expectedVersion: 0, data: { year: 2027, month: 2, title: `${SIX_MARCH.title} (복사)` } });
    expect(copy.data!.weeklyFocus).toEqual(SIX_MARCH.weeklyFocus);
    expect(stored(harness, 'monthly', SIX_MARCH.id).version).toBe(savedVersion);
    expect(harness.unexpected).toEqual([]);
  });
});

test.describe('Block6·날짜 선택기의 같은 주차 (2026-03-30 = 3월 W6)', () => {
  test('이번 주 포커스·날짜 선택기·새 주간 플랜이 W6을 쓰고, 월간에서 W6을 적으면 Block6에 보인다', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const harness = await setup(context, [LEGACY_MARCH, BLOCK6_W6, DAILY_0330], new Date('2026-03-30T10:00:00+09:00'));
    await open(page, BLOCK6_W6);
    await expect(page.getByText('3월 W6 포커스가 비어있어요')).toBeVisible();

    // 주간 날짜 선택기: 한 행이 월~일, W6 행 = 3/30~4/5이고 선택되어 있다
    await page.getByTitle('플랜 날짜 변경').click();
    const picker = page.getByRole('dialog', { name: '날짜 선택' });
    const w6 = picker.locator('[data-week="6"]');
    await expect(w6).toHaveText(['30', '31', '1', '2', '3', '4', '5']);
    await expect(picker.getByText('3월 6주차: 30일 ~ 4/5')).toBeVisible();
    const rowTops = await w6.evaluateAll((els) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))]);
    expect(rowTops).toHaveLength(1);
    await expect(picker.locator('[data-week="1"]')).toHaveText(['23', '24', '25', '26', '27', '28', '1']);
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    // 일간 날짜 선택기도 월요일 시작: 3/1(일)은 일요일 열(3/8과 같은 열)
    await open(page, DAILY_0330);
    await page.getByTitle('플랜 날짜 변경').click();
    const dayButton = (n: string) => picker.getByRole('button', { name: n, exact: true });
    await expectSameColumn(dayButton('1'), dayButton('8'));
    await expectSameColumn(dayButton('30'), dayButton('2'));
    expect(await centerX(dayButton('2'))).toBeLessThan(await centerX(dayButton('3')));
    await page.keyboard.press('Escape');
    await open(page, BLOCK6_W6);

    // 이전 5개 월간 플랜으로 가서 W6 작성 → Block6 이번 주 포커스에 표시
    await page.getByRole('button', { name: '월간 플래너에서 작성' }).click();
    await expect(titleInput(page)).toHaveValue(LEGACY_MARCH.title);
    await focusRow(page, 6).getByRole('button').click();
    await page.getByLabel('W6 포커스').fill('월말 정리');
    await page.getByLabel('W6 포커스').press('Enter');
    await expect.poll(() => (stored(harness, 'monthly', LEGACY_MARCH.id).data as MonthlyData).weeklyFocus.length).toBe(6);
    await page.goBack();
    await expect(titleInput(page)).toHaveValue(BLOCK6_W6.title);
    await expect(page.getByText('월말 정리')).toBeVisible();
    await expect(page.getByText(`3월 W6 · ${LEGACY_MARCH.title}`)).toBeVisible();

    // 오늘(3/30) 새 주간 Block6의 기본 주차는 W6
    await page.locator('button[title="새로 만들기"]').nth(2).click();
    await page.getByRole('dialog').getByRole('button', { name: /Block 6/ }).first().click();
    await expect(picker.getByText('3월 6주차: 30일 ~ 4/5')).toBeVisible();
    await picker.getByRole('button', { name: '확인', exact: true }).click();
    await expect(titleInput(page)).toHaveValue('2026.03 W6');
    await expect(page.getByTitle('플랜 날짜 변경')).toHaveText('2026년 3월 6주차');
    await expect.poll(() => changes(harness).filter((change) => change.kind === 'block6').length).toBe(1);
    expect(changes(harness).find((change) => change.kind === 'block6')!.data).toMatchObject({ year: 2026, month: 3, week: 6, title: '2026.03 W6' });
    expect(stored(harness, 'block6', BLOCK6_W6.id).version).toBe(3);
    expect(harness.unexpected).toEqual([]);
  });
});
