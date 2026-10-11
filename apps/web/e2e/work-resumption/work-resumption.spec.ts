import { test, expect, Page, BrowserContext, Locator } from '@playwright/test';
import { GRID_POSITIONS, MandalartData } from '../../src/types/mandalart';
import { DailyData } from '../../src/types/daily';
import { Block6Data, BlockNumber, DAYS_OF_WEEK } from '../../src/types/block6';
import { MonthlyData } from '../../src/types/monthly';
import { DEFAULT_COLORS } from '../../src/lib/constants';

/**
 * 작업 복귀·빠른 시작 (docs/ui-ux-review.md 2순위 묶음).
 *
 * - 로그인한 서비스 모드. 인증·DB·AI는 모두 브라우저에서 가로챈 가상 응답이며 실제 서버·계정·AI에 닿지 않는다.
 * - 브라우저 시각은 2026-10-04 10:00(Asia/Seoul)로 고정한다. 실제 OS 시간대·실제 DB 동작은 이 검사 범위 밖이다.
 */

const NOW = new Date('2026-10-04T10:00:00+09:00');
const OLD = '2026-09-01T00:00:00.000Z';
const at = (minute: number) => new Date(Date.UTC(2026, 8, 20, 0, minute)).toISOString();
const MOBILE_MAX = 767;

interface Account { userId: string; name: string; email: string }
const ALICE: Account = { userId: 'a1a1a1a1-0000-4000-8000-0000000000a1', name: '가상 사용자 A', email: 'synthetic.resume.a@example.test' };
const BOB: Account = { userId: 'b2b2b2b2-0000-4000-8000-0000000000b2', name: '가상 사용자 B', email: 'synthetic.resume.b@example.test' };

const daily = (id: string, title: string, month: number, day: number, updatedAt: string, createdAt = OLD): DailyData => ({
  id, title, template: 'daily', category: 'daily', year: 2026, month, day,
  todos: [{ id: `${id}-todo`, text: `${title} 할 일`, completed: false }], memo: '', createdAt, updatedAt,
});

const MANDALART: MandalartData = {
  id: 'wr-mandalart', title: '복귀 만다라트', template: 'mandalart', category: 'annual', year: 2026,
  createdAt: OLD, updatedAt: at(1),
  grids: GRID_POSITIONS.map((position) => ({
    id: position, color: DEFAULT_COLORS[position],
    cells: Array.from({ length: 9 }, (_, i) => ({ id: `${position}-${i}`, position: i, value: position === 'center' && i === 4 ? '가상 핵심 목표' : '' })),
  })),
};
const BLOCK6: Block6Data = {
  id: 'wr-block6', title: '복귀 주간', template: 'block6', category: 'weekly', year: 2026, month: 9, week: 4,
  blocks: DAYS_OF_WEEK.flatMap((day) => ([1, 2, 3, 4, 5, 6] as BlockNumber[]).map((blockNumber) => ({ id: `${day}-${blockNumber}`, day, blockNumber, keyword: '', todos: [] }))),
  backlog: [], createdAt: OLD, updatedAt: at(2),
};
const MONTHLY: MonthlyData = {
  id: 'wr-monthly', title: '복귀 월간', template: 'monthly', category: 'monthly', year: 2026, month: 9,
  goals: [{ id: 'wr-goal', text: '가상 목표', progress: 10, completed: false }],
  weeklyFocus: [1, 2, 3, 4, 5].map((weekNumber) => ({ weekNumber, text: '' })), memo: '', createdAt: OLD, updatedAt: at(3),
};
const DAILY = daily('wr-daily', '복귀 일간', 9, 20, at(4));
/** 네 템플릿을 사이드바에서 고를 순서 */
const FOUR = [['mandalart', MANDALART], ['block6', BLOCK6], ['monthly', MONTHLY], ['daily', DAILY]] as const;
const DELETED_ID = 'wr-deleted-daily';
const BOB_DAILY = daily('wr-bob-daily', 'B 계정 일간', 9, 21, at(5));
const TODAY_A = daily('wr-today-a', '오늘 첫 플랜', 10, 4, at(6), '2026-10-03T23:00:00.000Z');
const TODAY_B = daily('wr-today-b', '오늘 두 번째 플랜', 10, 4, at(7), '2026-10-03T23:30:00.000Z');

type Plan = MandalartData | Block6Data | MonthlyData | DailyData;
interface StoredRecord { kind: string; id: string; schemaVersion: 1; version: number; deleted: boolean; data: unknown; updatedAt: string }

interface Harness {
  account: Account | null;
  /** userId → (kind:id → record) */
  db: Map<string, Map<string, StoredRecord>>;
  meMode: 'ok' | 'error' | 'hold' | 'signedOut';
  releaseMe: () => void;
  plannerReads: string[];
  plannerFail: boolean;
  commits: { userId: string; changes: { kind: string; id: string; expectedVersion: number; data: unknown }[] }[];
  unexpected: string[];
}

function seed(plans: Plan[], deletedIds: string[] = []): Map<string, StoredRecord> {
  const records = new Map<string, StoredRecord>();
  for (const plan of plans) {
    records.set(`${plan.template}:${plan.id}`, { kind: plan.template, id: plan.id, schemaVersion: 1, version: 3, deleted: false, data: plan, updatedAt: plan.updatedAt });
  }
  for (const id of deletedIds) records.set(`daily:${id}`, { kind: 'daily', id, schemaVersion: 1, version: 4, deleted: true, data: null, updatedAt: OLD });
  return records;
}

/** installAt: 고정 시각 대신 흐르는 가짜 시계(타이머 제어 가능)로 시작한다 */
async function setup(context: BrowserContext, options: { alice?: Plan[]; bob?: Plan[]; account?: Account | null; installAt?: Date } = {}): Promise<Harness> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const harness: Harness = {
    account: options.account === undefined ? ALICE : options.account,
    db: new Map([
      [ALICE.userId, seed(options.alice ?? [MANDALART, BLOCK6, MONTHLY, DAILY], options.alice ? [] : [DELETED_ID])],
      [BOB.userId, seed(options.bob ?? [BOB_DAILY])],
    ]),
    meMode: 'ok', releaseMe: () => release(), plannerReads: [], plannerFail: false, commits: [], unexpected: [],
  };
  if (options.installAt) await context.clock.install({ time: options.installAt });
  else await context.clock.setFixedTime(NOW);

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
  await context.route('**/api/v1/me', async (route) => {
    if (harness.meMode === 'hold') await held;
    if (harness.meMode === 'error') return route.fulfill({ status: 500, json: { error: 'synthetic_auth_outage' } });
    const account = harness.account;
    if (!account || harness.meMode === 'signedOut') return route.fulfill({ json: { authenticated: false } });
    return route.fulfill({
      json: {
        authenticated: true, storageEnabled: true,
        user: { authProvider: 'google', externalSubject: `resume-${account.userId}`, name: account.name, email: account.email, userId: account.userId },
      },
    });
  });
  await context.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-WR-CSRF', token: 'wr-token' } }));
  await context.route('**/api/v1/logout', (route) => {
    harness.meMode = 'signedOut';
    return route.fulfill({ status: 204, body: '' });
  });
  await context.route('**/api/v1/planner', (route) => {
    const userId = route.request().headers()['x-plannet-user-id'] ?? '';
    harness.plannerReads.push(userId);
    if (harness.plannerFail) return route.fulfill({ status: 500, json: { error: 'synthetic_db_outage' } });
    // 모의 서버도 세션 계정의 기록만 돌려준다. 요청 헤더가 다르면 실제 API처럼 거절한다.
    if (!harness.account || userId !== harness.account.userId) return route.fulfill({ status: 409, json: { error: 'account_changed' } });
    return route.fulfill({ json: { userId, records: [...harness.db.get(userId)!.values()] } });
  });
  await context.route('**/api/v1/planner/commit', (route) => {
    const userId = route.request().headers()['x-plannet-user-id'] ?? '';
    const { changes } = route.request().postDataJSON() as Harness['commits'][number];
    harness.commits.push({ userId, changes });
    const records = harness.db.get(userId)!;
    const saved = changes.map((change) => ({
      kind: change.kind, id: change.id, schemaVersion: 1 as const, version: change.expectedVersion + 1,
      deleted: change.data === null, data: change.data, updatedAt: NOW.toISOString(),
    }));
    saved.forEach((record) => records.set(`${record.kind}:${record.id}`, record));
    return route.fulfill({ json: { records: saved } });
  });
  await context.route('**/api/chat', (route) => {
    harness.unexpected.push('/api/chat');
    return route.fulfill({ status: 503, json: { error: 'blocked_in_test' } });
  });
  return harness;
}

const titleInput = (page: Page) => page.locator('header input').first();
const sidebar = (page: Page) => page.locator('aside');
const openToggle = (page: Page) => page.locator('button[title="사이드바 열기"]');
const isMobile = (page: Page) => page.viewportSize()!.width <= MOBILE_MAX;
const home = (page: Page) => page.getByRole('heading', { name: '오늘 할 일' });
const notice = (page: Page) => page.getByTestId('plan-url-notice');
const logout = (page: Page) => page.getByRole('button', { name: '로그아웃' });
const planHref = (template: string, id: string) => `/?template=${template}&plan=${id}`;
const versions = (harness: Harness, userId = ALICE.userId) =>
  [...harness.db.get(userId)!.values()].map((record) => `${record.kind}:${record.id}@${record.version}`).sort();

async function expectOpened(page: Page, plan: Plan) {
  await expect(titleInput(page)).toHaveValue(plan.title);
  expect(new URL(page.url()).search).toBe(`?template=${plan.template}&plan=${plan.id}`);
}

async function expectHome(page: Page) {
  await expect(home(page)).toBeVisible();
  await expect(titleInput(page)).toHaveCount(0);
}

async function selectInSidebar(page: Page, title: string) {
  if (isMobile(page)) await openToggle(page).click();
  await sidebar(page).getByRole('button', { name: title }).filter({ hasText: title }).first().click();
  await expect(titleInput(page)).toHaveValue(title);
  if (isMobile(page)) await expect(sidebar(page)).toHaveAttribute('inert', '');
}

/** 같은 문서에서 이동했는지(전체 새로고침이 아닌지) 확인하는 표식 */
const markDocument = (page: Page) => page.evaluate(() => { (window as unknown as { __wr: number }).__wr = 1; });
const documentMarked = (page: Page) => page.evaluate(() => (window as unknown as { __wr?: number }).__wr === 1);

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function expectInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
}

test.describe('주소의 플랜 선택 복원', () => {
  for (const width of [360, 768, 1440]) {
    test(`${width}px: 네 템플릿 선택이 새로고침·새 탭·뒤로/앞으로에서 복원되고 저장 요청이 없다`, async ({ context, page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await setup(context);
      const before = versions(harness);

      await page.goto('/');
      await expectHome(page);
      expect(new URL(page.url()).search).toBe('');
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await expectInViewport(page, page.getByRole('button', { name: '오늘 플랜 만들기' }));
      await page.screenshot({ path: test.info().outputPath(`home-${width}.png`), fullPage: true });
      await markDocument(page);

      for (const [, plan] of FOUR) {
        await selectInSidebar(page, plan.title);
        await expectOpened(page, plan);
      }
      // 주소에는 선택 정보만: 제목·이메일이 들어가지 않는다.
      expect(page.url()).not.toContain(encodeURIComponent(DAILY.title));
      expect(page.url()).not.toContain(ALICE.email);

      // 뒤로: daily → monthly → block6 → mandalart → 빈 화면. 같은 문서 안의 이동이다.
      for (const [, plan] of [...FOUR].reverse().slice(1)) {
        await page.goBack();
        await expectOpened(page, plan);
      }
      await page.goBack();
      await expectHome(page);
      await expect(notice(page)).toHaveCount(0);
      for (const [, plan] of FOUR) {
        await page.goForward();
        await expectOpened(page, plan);
      }
      expect(await documentMarked(page)).toBe(true);

      // 새로고침은 같은 플랜을 다시 연다.
      await page.reload();
      await expectOpened(page, DAILY);
      await page.screenshot({ path: test.info().outputPath(`restored-daily-${width}.png`), fullPage: true });

      // 새 탭(같은 계정 세션)에서 주소를 직접 열기: 네 템플릿 모두
      const tab = await context.newPage();
      for (const [template, plan] of FOUR) {
        await tab.goto(planHref(template, plan.id));
        await expectOpened(tab, plan);
        expect(await pageOverflow(tab)).toBeLessThanOrEqual(0);
      }
      await tab.close();

      // 자동 저장 대기(650ms)보다 넉넉히 기다려도 읽기 전용 이동은 저장 요청·버전 변경이 없다.
      await page.waitForTimeout(1500);
      expect(harness.commits).toEqual([]);
      expect(versions(harness)).toEqual(before);
      expect(new Set(harness.plannerReads)).toEqual(new Set([ALICE.userId]));
      expect(harness.unexpected).toEqual([]);
    });
  }

  test('잘못된·없는·삭제된·템플릿이 다른 ID는 내용을 열지 않고 안내하며 주소를 비운다', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const harness = await setup(context);
    const before = versions(harness);
    const cases = [
      { href: '/?template=daily&plan=..%2Fsecret', notice: '올바르지 않아요' },
      { href: '/?template=bogus&plan=wr-daily', notice: '올바르지 않아요' },
      { href: '/?plan=wr-daily', notice: '올바르지 않아요' },
      { href: '/?template=daily&plan=wr-daily&plan=wr-monthly', notice: '올바르지 않아요' },
      { href: `/?template=daily&plan=${'x'.repeat(129)}`, notice: '올바르지 않아요' },
      { href: planHref('daily', 'wr-missing'), notice: '열 수 없어요' },
      { href: planHref('daily', DELETED_ID), notice: '열 수 없어요' },
      // 같은 ID라도 다른 템플릿의 store에서는 찾지 않는다
      { href: planHref('monthly', DAILY.id), notice: '열 수 없어요' },
    ];
    for (const item of cases) {
      await page.goto(item.href);
      await expect(notice(page), item.href).toContainText(item.notice);
      await expectHome(page);
      expect(new URL(page.url()).search, item.href).toBe('');
      await expect(sidebar(page).locator('[aria-current="true"]')).toHaveCount(0);
      await expect(page.getByText(`${DAILY.title} 할 일`)).toHaveCount(0);
    }
    await page.screenshot({ path: test.info().outputPath('notice-unavailable-1440.png'), fullPage: true });

    // 안내 뒤에도 정상 선택은 바로 되고, 안내는 사라진다.
    await selectInSidebar(page, DAILY.title);
    await expectOpened(page, DAILY);
    await expect(notice(page)).toHaveCount(0);

    // 뒤로 가기로 주소가 비워진 기록에 돌아와도 다시 조회·생성하지 않는다.
    await page.goBack();
    await expectHome(page);
    await page.waitForTimeout(1200);
    expect(harness.commits).toEqual([]);
    expect(versions(harness)).toEqual(before);
    expect(harness.unexpected).toEqual([]);
  });

  test('선택한 플랜을 삭제하면 주소가 비워지고, 뒤로 가기가 삭제된 플랜을 다시 열지 않는다', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const harness = await setup(context);
    await page.goto(planHref('monthly', MONTHLY.id));
    await expectOpened(page, MONTHLY);
    await selectInSidebar(page, DAILY.title);
    await expectOpened(page, DAILY);

    const row = sidebar(page).getByRole('button', { name: DAILY.title }).filter({ hasText: DAILY.title }).first();
    await row.hover();
    await sidebar(page).getByRole('button', { name: `${DAILY.title} 메뉴` }).click();
    await sidebar(page).getByRole('button', { name: '삭제' }).click();
    await page.getByRole('button', { name: '삭제', exact: true }).last().click();
    await expectHome(page);
    expect(new URL(page.url()).search).toBe('');
    await expect.poll(() => harness.db.get(ALICE.userId)!.get(`daily:${DAILY.id}`)!.deleted).toBe(true);

    await page.goBack();
    await expectOpened(page, MONTHLY);
    await page.goForward();
    await expectHome(page);
    await expect(page.getByText(`${DAILY.title} 할 일`)).toHaveCount(0);
  });
});

test.describe('인증·계정 경계', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('다른 계정의 플랜 ID는 조회하지 않고 열지 않는다. 계정이 바뀐 새로고침도 이전 계정 내용을 보이지 않는다', async ({ context, page }) => {
    const harness = await setup(context, { account: BOB });
    await page.goto(planHref('daily', DAILY.id));
    await expect(notice(page)).toContainText('열 수 없어요');
    await expectHome(page);
    await expect(page.getByText(DAILY.title)).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
    // B 계정의 기록만 한 번 읽었다. A 계정 ID로 요청하지 않는다.
    expect(harness.plannerReads).toEqual([BOB.userId]);

    // A로 로그인한 상태에서 A 플랜을 연 뒤, 같은 탭이 B 세션으로 바뀌어 새로고침된 경우
    harness.account = ALICE;
    await page.goto(planHref('daily', DAILY.id));
    await expectOpened(page, DAILY);
    harness.account = BOB;
    await page.reload();
    await expect(page.getByTestId('auth-account-email')).toHaveText(BOB.email);
    await expect(notice(page)).toContainText('열 수 없어요');
    await expect(page.getByText(DAILY.title)).toHaveCount(0);
    await expect(page.getByText(`${DAILY.title} 할 일`)).toHaveCount(0);
    await page.waitForTimeout(1200);
    expect(harness.commits).toEqual([]);
    expect(harness.unexpected).toEqual([]);
  });

  test('로그인 확인 중·확인 실패·DB 첫 조회 실패 동안에는 주소의 플랜을 열거나 지우지 않는다', async ({ context, page }) => {
    const harness = await setup(context);
    const href = planHref('daily', DAILY.id);

    harness.meMode = 'hold';
    await page.goto(href);
    await page.waitForTimeout(800);
    await expect(titleInput(page)).toHaveCount(0);
    await expect(page.getByText(DAILY.title)).toHaveCount(0);
    expect(harness.plannerReads).toEqual([]);
    expect(new URL(page.url()).search).toBe(`?template=daily&plan=${DAILY.id}`);
    harness.meMode = 'ok';
    harness.releaseMe();
    await expectOpened(page, DAILY);

    harness.meMode = 'error';
    harness.plannerReads = [];
    await page.reload();
    await expect(page.getByText('로그인 상태를 확인할 수 없어요')).toBeVisible();
    await expect(titleInput(page)).toHaveCount(0);
    expect(harness.plannerReads).toEqual([]);
    expect(new URL(page.url()).search).toBe(`?template=daily&plan=${DAILY.id}`);

    harness.meMode = 'ok';
    harness.plannerFail = true;
    await page.reload();
    await expect.poll(() => harness.plannerReads.length).toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await expect(titleInput(page)).toHaveCount(0);
    await expect(home(page)).toHaveCount(0);
    expect(new URL(page.url()).search).toBe(`?template=daily&plan=${DAILY.id}`);

    harness.plannerFail = false;
    await page.reload();
    await expectOpened(page, DAILY);
    expect(harness.commits).toEqual([]);
    expect(harness.unexpected).toEqual([]);
  });

  test('로그아웃하면 주소의 선택이 지워지고, 뒤로 가기로도 플랜 내용이 다시 보이지 않는다', async ({ context, page }) => {
    const harness = await setup(context);
    await page.goto('/');
    await expectHome(page);
    await selectInSidebar(page, MONTHLY.title);
    await selectInSidebar(page, DAILY.title);
    const readsBefore = harness.plannerReads.length;

    await logout(page).click();
    await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    await page.goBack();
    await page.waitForTimeout(800);
    await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
    await expect(titleInput(page)).toHaveCount(0);
    await expect(page.getByText(DAILY.title)).toHaveCount(0);
    await expect(page.getByText(MONTHLY.title)).toHaveCount(0);
    expect(harness.plannerReads.length).toBe(readsBefore);
    expect(harness.commits).toEqual([]);
  });
});

test.describe('빈 작업 공간의 빠른 시작', () => {
  for (const width of [360, 1440]) {
    test(`${width}px: 오늘 플랜이 없으면 명시적으로 한 번만 만들고, 이후에는 기존 플랜을 연다`, async ({ context, page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await setup(context);
      const before = versions(harness);
      await page.goto('/');
      await expectHome(page);

      // 불러오기·새로고침만으로는 만들지 않는다.
      await page.reload();
      await expectHome(page);
      await page.waitForTimeout(1200);
      expect(harness.commits).toEqual([]);

      // 최근 작업: updatedAt 내림차순(같으면 template:id)
      const recent = page.getByRole('list', { name: '최근 작업' }).getByRole('button');
      await expect(recent).toHaveCount(4);
      await expect(recent.nth(0)).toContainText(DAILY.title);
      await expect(recent.nth(3)).toContainText(MANDALART.title);

      // 다시 그리기 전에 두 번 눌러도(같은 작업 안의 연속 클릭) 한 번만 만든다.
      await page.getByRole('button', { name: '오늘 플랜 만들기' }).evaluate((el: HTMLElement) => { el.click(); el.click(); });
      await expect(titleInput(page)).toHaveValue('2026.10.04');
      await expect(page.getByRole('heading', { name: /2026년 10월 4일/ })).toBeVisible();
      await expect.poll(() => harness.commits.flatMap((commit) => commit.changes).length).toBeGreaterThan(0);
      await page.waitForTimeout(1200);
      const created = harness.commits.flatMap((commit) => commit.changes);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ kind: 'daily', expectedVersion: 0, data: { category: 'daily', year: 2026, month: 10, day: 4, title: '2026.10.04' } });
      expect(new URL(page.url()).search).toBe(`?template=daily&plan=${created[0].id}`);
      // 기존 기록은 그대로다.
      expect(versions(harness).filter((key) => !key.startsWith(`daily:${created[0].id}@`))).toEqual(before);

      // 뒤로 가면 빈 화면이 '오늘 플랜 열기'를 보여 주고 다시 만들지 않는다.
      await page.goBack();
      await expectHome(page);
      await expect(page.getByRole('button', { name: '오늘 플랜 만들기' })).toHaveCount(0);
      await page.getByRole('button', { name: /^오늘 플랜 열기/ }).click();
      await expect(titleInput(page)).toHaveValue('2026.10.04');
      await page.reload();
      await expect(titleInput(page)).toHaveValue('2026.10.04');
      await page.waitForTimeout(1200);
      expect(harness.commits.flatMap((commit) => commit.changes)).toHaveLength(1);
      expect(harness.unexpected).toEqual([]);
    });
  }

  test('오늘 날짜 플랜이 여럿이면 모두 보여 주고 고른 플랜만 연다(병합·생성 없음)', async ({ context, page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    const harness = await setup(context, { alice: [MANDALART, DAILY, TODAY_A, TODAY_B] });
    await page.goto('/');
    await expectHome(page);
    const todays = page.getByRole('list', { name: '오늘 플랜' }).getByRole('button');
    await expect(todays).toHaveCount(2);
    // 최근 만든 순(같으면 template:id)
    await expect(todays.nth(0)).toContainText(TODAY_B.title);
    await expect(todays.nth(1)).toContainText(TODAY_A.title);
    await expect(page.getByText('오늘 날짜의 일간 플랜이 2개 있어요')).toBeVisible();
    await expect(page.getByRole('button', { name: '오늘 플랜 만들기' })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('home-two-today-768.png'), fullPage: true });

    await todays.nth(1).click();
    await expectOpened(page, TODAY_A);
    await expect(page.getByText(`${TODAY_A.title} 할 일`)).toBeVisible();
    await page.waitForTimeout(1200);
    expect(harness.commits).toEqual([]);
  });
});

test.describe('선택적 가이드', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('반복 생성은 가이드 없이 끝나고, 사용법은 헤더와 템플릿 선택에서 열 수 있다', async ({ context, page }) => {
    const harness = await setup(context, { alice: [] });
    await page.goto('/');
    await expectHome(page);
    const flows = [
      { category: 0, template: /만다라트/, label: '만다라트', placeholder: '나의 만다라트' },
      { category: 2, template: /Block 6/, label: 'Block 6', placeholder: '나의 Block 6' },
      { category: 1, template: /월간 플래너/, label: '월간 플래너', placeholder: '나의 월간 플래너' },
      { category: 3, template: /투두리스트/, label: '투두리스트', placeholder: '나의 투두리스트' },
      { category: 3, template: /투두리스트/, label: '투두리스트', placeholder: '나의 투두리스트' },
    ];
    for (const flow of flows) {
      const plus = page.locator('button[title="새로 만들기"]').nth(flow.category);
      await plus.click();
      await page.getByRole('dialog').getByRole('button', { name: flow.template }).first().click();
      await page.getByRole('dialog', { name: '날짜 선택' }).getByRole('button', { name: '확인', exact: true }).click();
      // 날짜 확인이 마지막 단계다. 가이드가 끼어들지 않는다.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByPlaceholder(flow.placeholder)).toBeVisible();
      await expect(plus).toBeFocused();

      // 헤더 사용법: 열고, Esc로 닫으면 사용법 버튼으로 초점이 돌아온다. 플랜을 새로 만들지 않는다.
      const help = page.getByRole('button', { name: `${flow.label} 사용법`, exact: true });
      await help.click();
      const guide = page.getByRole('dialog', { name: `${flow.label} 사용법` });
      await expect(guide).toBeVisible();
      await expect.poll(() => guide.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(guide).toBeHidden();
      await expect(help).toBeFocused();
    }
    await expect.poll(() => harness.db.get(ALICE.userId)!.size).toBe(flows.length);
    const titles = [...harness.db.get(ALICE.userId)!.values()].map((record) => (record.data as { title: string }).title);
    // 같은 날 두 번 만든 투두리스트는 기본 제목에 번호가 붙는다(기존 생성 기본값).
    expect(titles.filter((title) => title.startsWith('2026.10.04'))).toEqual(['2026.10.04', '2026.10.04 (2)']);

    // 헤더 사용법의 확인 버튼도 닫기만 한다.
    const help = page.getByRole('button', { name: '투두리스트 사용법', exact: true });
    await help.click();
    await page.getByRole('dialog', { name: '투두리스트 사용법' }).getByRole('button', { name: '확인' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(harness.db.get(ALICE.userId)!.size).toBe(flows.length);

    // 템플릿 선택의 사용법 → 시작하기 → 날짜 선택(Esc는 템플릿 선택으로) → 확인으로 생성
    const plus = page.locator('button[title="새로 만들기"]').nth(3);
    await plus.click();
    const templateDialog = page.getByRole('dialog', { name: '일간 플랜 만들기' });
    await templateDialog.getByRole('button', { name: '투두리스트 사용법 보기' }).click();
    const guide = page.getByRole('dialog', { name: '투두리스트 사용법' });
    await expect(guide).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeVisible();
    await templateDialog.getByRole('button', { name: '투두리스트 사용법 보기' }).click();
    await guide.getByRole('button', { name: '시작하기' }).click();
    const dateDialog = page.getByRole('dialog', { name: '날짜 선택' });
    await expect(dateDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeVisible();
    await templateDialog.getByRole('button', { name: '투두리스트 사용법 보기' }).click();
    await guide.getByRole('button', { name: '시작하기' }).click();
    await dateDialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(titleInput(page)).toHaveValue('2026.10.04 (3)');
    await expect.poll(() => harness.db.get(ALICE.userId)!.size).toBe(flows.length + 1);
    expect(harness.unexpected).toEqual([]);
  });

  test('360px: 헤더 사용법이 화면 안에 있고, 생성 후 사이드바가 닫힌다', async ({ context, page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await setup(context);
    await page.goto(planHref('mandalart', MANDALART.id));
    await expectOpened(page, MANDALART);
    const help = page.getByRole('button', { name: '만다라트 사용법', exact: true });
    await expectInViewport(page, help);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await help.click();
    await expect(page.getByRole('dialog', { name: '만다라트 사용법' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();

    await openToggle(page).click();
    await page.locator('button[title="새로 만들기"]').nth(3).click();
    await page.getByRole('dialog').getByRole('button', { name: /투두리스트/ }).first().click();
    await page.getByRole('dialog', { name: '날짜 선택' }).getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(sidebar(page)).toHaveAttribute('inert', '');
    await expect(page.getByPlaceholder('할 일을 입력하세요...')).toBeInViewport();
    // 닫히는 전환(300ms)이 끝나 사이드바가 화면 밖에 있다
    await expect.poll(async () => { const box = (await sidebar(page).boundingBox())!; return box.x + box.width; }).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath('created-daily-360.png'), fullPage: true });
  });
});

test.describe('총괄 검토 후속', () => {
  test('헤더 사용법 버튼은 키보드 초점에서만 보이는 초점 링을 그린다', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(context);
    await page.goto(planHref('daily', DAILY.id));
    await expectOpened(page, DAILY);
    const help = page.getByRole('button', { name: '투두리스트 사용법', exact: true });
    const ring = () => help.evaluate((el) => ({ visible: el.matches(':focus-visible'), shadow: getComputedStyle(el).boxShadow }));

    // 초점이 없을 때는 링이 없다(비교 기준).
    expect((await ring()).shadow).toBe('none');
    // 키보드 Tab으로 들어오면 :focus-visible + 2겹(흰 간격 + indigo) box-shadow
    await page.locator('button[title="플랜 날짜 변경"]').focus();
    await page.keyboard.press('Tab');
    await expect(help).toBeFocused();
    const focused = await ring();
    expect(focused.visible).toBe(true);
    expect(focused.shadow).not.toBe('none');
    expect(focused.shadow.match(/(rgb|oklch|oklab|color)\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // 링은 버튼 바깥(offset)에 그려지므로 주변 여백을 포함해 찍는다.
    const box = (await help.boundingBox())!;
    await page.screenshot({ path: test.info().outputPath('help-focus-visible.png'), clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
    // 초점이 떠나면 링도 사라진다.
    await page.keyboard.press('Tab');
    expect((await ring()).shadow).toBe('none');
  });

  test('자정을 넘겨 열린 탭: 자정에 오늘 날짜를 갱신한다(다시 그리기·폴링 없이)', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const harness = await setup(context, { installAt: new Date('2026-10-04T23:59:50+09:00') });
    await page.goto('/');
    await expectHome(page);
    await expect(page.getByText('2026년 10월 4일 · 일간 투두리스트')).toBeVisible();
    await page.clock.runFor(15_000);
    await expect(page.getByText('2026년 10월 5일 · 일간 투두리스트')).toBeVisible();
    await page.getByRole('button', { name: '오늘 플랜 만들기' }).click();
    await expect(titleInput(page)).toHaveValue('2026.10.05');
    await expect.poll(() => harness.commits.flatMap((commit) => commit.changes).length).toBe(1);
    expect(harness.commits[0].changes[0]).toMatchObject({ kind: 'daily', expectedVersion: 0, data: { year: 2026, month: 10, day: 5 } });
    expect(harness.unexpected).toEqual([]);
  });

  test('잠든 탭(타이머 없음): 다시 보이면 날짜를 갱신하고, 바로 누른 생성도 현재 날짜·store를 다시 확인한다', async ({ context, page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    const OCT5 = daily('wr-oct5', '10월 5일 플랜', 10, 5, at(8));
    const harness = await setup(context, { alice: [MANDALART, OCT5], installAt: new Date('2026-10-04T23:50:00+09:00') });
    await page.goto('/');
    await expectHome(page);
    await expect(page.getByText('2026년 10월 4일 · 일간 투두리스트')).toBeVisible();
    const create = page.getByRole('button', { name: '오늘 플랜 만들기' });
    await expect(create).toBeVisible();

    // 노트북이 잠든 것처럼 타이머 없이 시각만 다음 날로 옮긴다. 화면은 아직 어제 기준이다.
    await page.clock.setSystemTime(new Date('2026-10-05T08:00:00+09:00'));
    // 어제 날짜로 만들거나 이미 있는 오늘 플랜을 하나 더 만들지 않고 기존 오늘 플랜을 연다.
    await create.click();
    await expectOpened(page, OCT5);
    await page.waitForTimeout(1200);
    expect(harness.commits).toEqual([]);

    // 다시 빈 화면으로 와서 시각을 하루 더 옮기고, 탭이 다시 보이면 날짜가 갱신된다.
    await page.goBack();
    await expectHome(page);
    await page.clock.setSystemTime(new Date('2026-10-06T08:00:00+09:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText('2026년 10월 6일 · 일간 투두리스트')).toBeVisible();
    await expect(page.getByRole('button', { name: '오늘 플랜 만들기' })).toBeVisible();
    await page.waitForTimeout(1200);
    expect(harness.commits).toEqual([]);
    expect(harness.unexpected).toEqual([]);
  });
});
