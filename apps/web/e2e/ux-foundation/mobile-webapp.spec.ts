import { test, expect, Page, Locator } from '@playwright/test';
import { CENTER_TO_OUTER_MAP, GRID_POSITIONS, MandalartData } from '../../src/types/mandalart';
import { DailyData } from '../../src/types/daily';
import { Block6Data, BlockNumber, DAYS_OF_WEEK } from '../../src/types/block6';
import { DEFAULT_COLORS } from '../../src/lib/constants';

/**
 * iPhone·터치 웹앱 개선 회귀 (터치 조작·안전 영역·키보드·홈 화면 앱).
 *
 * - 로그인한 서비스 모드. 인증·DB·AI는 브라우저에서 가로챈 가상 응답이며 실제 서버·계정·AI에 닿지 않는다.
 * - 터치는 Chromium 모바일 에뮬레이션(hasTouch·isMobile)과 CDP 터치 이벤트다. 실제 iPhone Safari·화상 키보드·
 *   홈 화면 앱 로그인 복귀·백그라운드 종료는 실기기 확인 대상이다.
 */

const FIXED_TIME = '2026-09-30T00:00:00.000Z';
const USER_ID = 'c3c3c3c3-0000-4000-8000-00000000000d';
const TOUCH_MIN = 44;
// 검토용 대표 화면 저장 위치 (설정했을 때만)
const SCREENSHOT_DIR = process.env.MW_SCREENSHOT_DIR;

async function keepScreenshot(page: Page, name: string) {
  if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
}

const DAILY: DailyData = {
  id: 'mw-daily', title: '터치 일간', template: 'daily', category: 'daily', year: 2026, month: 9, day: 30,
  todos: [
    { id: 'mw-a', text: '첫째 할 일', completed: false },
    { id: 'mw-b', text: '둘째 할 일', completed: false },
    { id: 'mw-c', text: '셋째 할 일', completed: false },
    { id: 'mw-d', text: '끝난 할 일', completed: true },
  ],
  memo: '', createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
};

const MANDALART: MandalartData = {
  id: 'mw-mandalart', title: '터치 만다라트', template: 'mandalart', category: 'annual', year: 2026,
  createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
  grids: GRID_POSITIONS.map((position) => ({
    id: position, color: DEFAULT_COLORS[position],
    cells: Array.from({ length: 9 }, (_, i) => ({
      id: `${position}-${i}`, position: i, value: position === 'center' && i === 4 ? '가상 핵심 목표' : '',
    })),
  })),
};

const BLOCK6: Block6Data = {
  id: 'mw-block6', title: '터치 주간', template: 'block6', category: 'weekly', year: 2026, month: 9, week: 4,
  blocks: DAYS_OF_WEEK.flatMap((day) => ([1, 2, 3, 4, 5, 6] as BlockNumber[]).map((blockNumber) => ({
    id: `${day}-${blockNumber}`, day, blockNumber, keyword: '', todos: [],
  }))),
  backlog: [{ id: 'mw-backlog-1', text: '가상 백로그', completed: false }],
  createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
};

const SEEDED = [['daily', DAILY], ['mandalart', MANDALART], ['block6', BLOCK6]] as const;

interface Harness {
  records: Map<string, { data: unknown }>;
  unexpected: string[];
  /** 가상 DB가 받은 저장 변경 (kind:id, 삭제 여부) */
  commits: { key: string; deleted: boolean }[];
}

async function mockApi(page: Page, authenticated: boolean): Promise<Harness> {
  const records = new Map<string, { kind: string; id: string; schemaVersion: 1; version: number; deleted: boolean; data: unknown; updatedAt: string }>();
  const harness: Harness = { records, unexpected: [], commits: [] };
  for (const [kind, plan] of SEEDED) {
    records.set(`${kind}:${plan.id}`, { kind, id: plan.id, schemaVersion: 1, version: 1, deleted: false, data: plan, updatedAt: FIXED_TIME });
  }
  await page.context().route('**/*', (route) => {
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
  await page.route('**/api/runtime-config', (route) => route.fulfill({ json: { authEnabled: true, backupEnabled: false } }));
  await page.route('**/api/v1/me', (route) => (authenticated
    ? route.fulfill({
      json: {
        authenticated: true, storageEnabled: true,
        user: { authProvider: 'google', externalSubject: 'mobile-webapp', name: '가상 사용자', email: 'synthetic.mobile@example.test', userId: USER_ID },
      },
    })
    : route.fulfill({ status: 401, json: { authenticated: false } })));
  await page.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-MW-CSRF', token: 'mw-token' } }));
  await page.route('**/api/v1/planner', (route) => route.fulfill({ json: { userId: USER_ID, records: [...records.values()] } }));
  await page.route('**/api/v1/planner/commit', (route) => {
    const { changes } = route.request().postDataJSON() as { changes: { kind: string; id: string; expectedVersion: number; data: unknown }[] };
    const saved = changes.map((change) => ({
      kind: change.kind, id: change.id, schemaVersion: 1 as const, version: change.expectedVersion + 1,
      deleted: change.data === null, data: change.data, updatedAt: FIXED_TIME,
    }));
    saved.forEach((record) => records.set(`${record.kind}:${record.id}`, record));
    harness.commits.push(...saved.map((record) => ({ key: `${record.kind}:${record.id}`, deleted: record.deleted })));
    return route.fulfill({ json: { records: saved } });
  });
  await page.route('**/api/chat', (route) => route.fulfill({
    json: { message: '가상 응답입니다', action: 'none', data: null, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUSD: '0.000000' } },
  }));
  return harness;
}

/** 만다라트 중앙 칸 값을 이 테스트에서만 바꿔 둔다(외곽 가운데 칸 글자도 같이). 공유 상수는 건드리지 않는다. */
type CenterSeed = Record<number, { value: string; icon?: string }>;

async function setup(page: Page, centerSeed?: CenterSeed) {
  const harness = await mockApi(page, true);
  if (centerSeed) {
    const key = `mandalart:${MANDALART.id}`;
    const record = harness.records.get(key)!;
    const data = structuredClone(MANDALART);
    for (const [index, seed] of Object.entries(centerSeed)) {
      Object.assign(data.grids.find((g) => g.id === 'center')!.cells[Number(index)], seed);
      const outer = CENTER_TO_OUTER_MAP[Number(index)];
      if (outer) data.grids.find((g) => g.id === outer)!.cells[4].value = seed.value;
    }
    harness.records.set(key, { ...record, data });
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  return harness;
}

const sidebar = (page: Page) => page.locator('aside');
const isMobile = (page: Page) => page.viewportSize()!.width < 768;

async function selectPlan(page: Page, title: string) {
  if (isMobile(page)) await page.locator('button[title="사이드바 열기"]').click();
  await sidebar(page).getByRole('button', { name: title }).filter({ hasText: title }).first().click();
  await expect(page.locator('header input').first()).toHaveValue(title);
  if (isMobile(page)) {
    await expect.poll(async () => {
      const box = (await sidebar(page).boundingBox())!;
      return box.x + box.width;
    }).toBeLessThanOrEqual(1);
  }
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element should be rendered').not.toBeNull();
  return b!;
}

/** 실제 터치 포인터(pointerType touch)로 끈다. touch-action이 막지 않으면 브라우저가 스크롤로 가져가 드래그가 취소된다. */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const center = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

function savedDaily(harness: Harness) {
  return (harness.records.get(`daily:${DAILY.id}`)!.data as DailyData).todos;
}
function savedBlock6(harness: Harness) {
  return harness.records.get(`block6:${BLOCK6.id}`)!.data as Block6Data;
}

test.describe('홈 화면 앱 정보', () => {
  test('manifest·아이콘 응답과 head 메타: 같은 origin, 확대 제한 없음', async ({ page, request }) => {
    const manifestResponse = await request.get('/manifest.webmanifest');
    expect(manifestResponse.status()).toBe(200);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      id: '/', start_url: '/', scope: '/', display: 'standalone', name: 'Plannet', short_name: 'Plannet',
      background_color: '#f8fafc', theme_color: '#f8fafc',
    });
    expect(manifest).not.toHaveProperty('serviceworker');

    const icons = [
      ...manifest.icons.map((icon: { src: string; sizes: string }) => ({ src: icon.src, size: Number(icon.sizes.split('x')[0]) })),
    ];
    await mockApi(page, false);
    await page.goto('/');
    const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(appleHref).toBeTruthy();
    icons.push({ src: appleHref!, size: 180 });
    for (const icon of icons) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      const png = await response.body();
      // PNG IHDR: 너비·높이 (16~24바이트)
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], icon.src).toEqual([icon.size, icon.size]);
    }
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /\/manifest\.webmanifest/);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).not.toMatch(/maximum-scale|user-scalable/);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Plannet');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f8fafc');
    await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  });

  test.describe('로그인 랜딩 360px', () => {
    test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
    test('가로 넘침 없이 로그인 버튼이 화면 안에 있다', async ({ page }) => {
      await mockApi(page, false);
      await page.goto('/');
      const login = page.getByRole('button', { name: 'Google 로그인' });
      await expect(login).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const b = await box(login);
      expect(b.x + b.width).toBeLessThanOrEqual(360);
    });
  });
});

for (const width of [360, 390]) {
  test.describe(`터치 ${width}px`, () => {
    test.use({ viewport: { width, height: 780 }, hasTouch: true, isMobile: true });

    test('Daily: 삭제·순서 손잡이가 보이고 44px, 입력 16px, 터치 끌기로 순서 변경, 삭제는 바로 저장', async ({ page }) => {
      const harness = await setup(page);
      expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
      await selectPlan(page, DAILY.title);

      const remove = page.getByRole('button', { name: '둘째 할 일 삭제' });
      const handle = page.getByRole('button', { name: '첫째 할 일 순서 변경' });
      await expect(remove).toHaveCSS('opacity', '1');
      for (const control of [remove, handle]) {
        const b = await box(control);
        expect(b.width).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect(b.height).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect(b.x + b.width).toBeLessThanOrEqual(width);
      }
      await expect(page.getByPlaceholder('할 일을 입력하세요...')).toHaveCSS('font-size', '16px');
      if (width === 360) await keepScreenshot(page, 'daily-touch-360');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

      // 첫째 → 셋째 자리로 손가락 끌기
      const from = center(await box(handle));
      const to = center(await box(page.getByText('셋째 할 일', { exact: true })));
      await touchDrag(page, from, { x: from.x, y: to.y + 8 });
      await expect.poll(() => savedDaily(harness).map((t) => t.id)).toEqual(['mw-b', 'mw-c', 'mw-a', 'mw-d']);

      // 삭제는 기존처럼 확인 없이 바로 지운다
      await remove.tap();
      await expect(page.getByText('둘째 할 일', { exact: true })).toHaveCount(0);
      await expect.poll(() => savedDaily(harness).map((t) => t.id)).toEqual(['mw-c', 'mw-a', 'mw-d']);
      expect(harness.unexpected).toEqual([]);
    });

    test('Mandalart: 셀 도구가 폭이 아니라 터치로 보이고 히트 영역이 44px, 셀 입력 16px', async ({ page }) => {
      // 도구 위치를 재므로 상세로 가는 부드러운 스크롤은 끈다
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setup(page);
      await selectPlan(page, MANDALART.title);
      const grid = page.locator('#mandalart-grid-mobile');
      // 빈 개요 칸에 그 자리에서 입력하고 나오면 버튼이 된다. 도구는 그 버튼으로 펼친 상세에 있다
      const sub1Input = grid.getByRole('textbox', { name: '하위 목표 1', exact: true });
      await sub1Input.tap();
      await page.keyboard.type('도구');
      await sub1Input.blur();
      await grid.getByRole('button', { name: '하위 목표 1: 도구' }).tap();
      const emoji = page.locator('#mandalart-mobile-detail button[title="이모지 선택"]').first();
      await expect(emoji).toHaveCSS('opacity', '1');
      const b = await box(emoji);
      expect(b.width).toBeGreaterThanOrEqual(24);
      // 보이는 버튼 바깥(셀 안쪽 대각선 15px)도 같은 버튼이 받는다
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('title'), {
        x: b.x + b.width / 2 - 15, y: b.y + b.height / 2 + 15,
      });
      expect(hit).toBe('이모지 선택');
      await expect(grid.locator('textarea').first()).toHaveCSS('font-size', '16px');
      // 중앙 그리드(핵심 목표) 색상 버튼은 개요 아래: 터치 44px, 화면 안
      const palette = await box(grid.getByRole('button', { name: '중앙 그리드 색상 변경' }));
      expect(palette.height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(palette.x + palette.width).toBeLessThanOrEqual(width);

      // 헤더 칩·⋮도 터치에서 44px이고 한 줄을 유지한다
      const date = await box(page.locator('header button[title="플랜 날짜 변경"]'));
      const menu = await box(page.locator('header').getByRole('button', { name: '메뉴', exact: true }));
      expect(date.height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(menu.height).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(Math.abs((menu.y + menu.height / 2) - (date.y + date.height / 2))).toBeLessThanOrEqual(2);
      expect(menu.x + menu.width).toBeLessThanOrEqual(width);
      if (width === 360) await keepScreenshot(page, 'mandalart-touch-360');
    });
  });
}

test.describe('터치 390px Block6·안내·키보드', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('Block6: 할 일 목록 항목을 메뉴의 옮기기…로 다른 요일 블록에 옮긴다 (Esc는 메뉴 버튼으로 복귀)', async ({ page }) => {
    const harness = await setup(page);
    await selectPlan(page, BLOCK6.title);
    await page.getByRole('button', { name: /주간 포커스 · 백로그 · 고정 할일/ }).tap();

    const menu = page.getByRole('button', { name: '가상 백로그 메뉴' });
    await expect(menu).toHaveCSS('opacity', '1');
    const handle = page.getByRole('button', { name: '가상 백로그 드래그하여 이동' });
    expect((await box(handle)).width).toBeGreaterThanOrEqual(28);

    await menu.tap();
    await page.getByRole('button', { name: '옮기기…' }).tap();
    const dialog = page.getByRole('dialog', { name: '할 일 옮기기' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '할 일 목록 · 현재 위치' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(menu).toBeFocused();
    expect(savedBlock6(harness).backlog.map((t) => t.id)).toEqual(['mw-backlog-1']);

    await menu.tap();
    await page.getByRole('button', { name: '옮기기…' }).tap();
    await dialog.getByRole('button', { name: '화', exact: true }).tap();
    await expect(dialog.getByRole('button', { name: '화', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const target = dialog.getByRole('button', { name: /^Block 2 · 오전/ });
    expect((await box(target)).height).toBeGreaterThanOrEqual(TOUCH_MIN);
    await keepScreenshot(page, 'block6-move-dialog-390');
    await target.tap();
    await expect(dialog).toHaveCount(0);

    await expect.poll(() => {
      const saved = savedBlock6(harness);
      return { backlog: saved.backlog.length, tue2: saved.blocks.find((b) => b.id === 'tue-2')!.todos.map((t) => t.text) };
    }).toEqual({ backlog: 0, tue2: ['가상 백로그'] });
    expect(harness.unexpected).toEqual([]);
  });

  test('홈 화면에 추가 안내: 대화상자 이름·초점·Esc 복귀, 온라인 전용 안내', async ({ page }) => {
    await setup(page);
    await page.locator('button[title="사이드바 열기"]').click();
    const open = sidebar(page).getByRole('button', { name: '홈 화면에 추가' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: '홈 화면에 추가' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
    await expect(dialog).toContainText('인터넷 연결이 필요');
    await expect(dialog).toContainText('서버에 저장됐어요');
    // 대화상자는 사이드바(transform) 밖 body에 그려져 화면 전체를 덮는다
    const b = await box(dialog);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.width).toBeGreaterThan(300);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('입력 중 화면 높이가 줄어도(키보드·도구 막대) 값·초점이 유지되고 AI 입력은 화면 안에 있다', async ({ page }) => {
    await setup(page);
    await selectPlan(page, DAILY.title);
    const input = page.getByPlaceholder('할 일을 입력하세요...');
    await input.tap();
    await input.fill('입력 유지');
    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForTimeout(200);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('입력 유지');
    await page.setViewportSize({ width: 390, height: 780 });
    await expect(input).toHaveValue('입력 유지');

    // AI 도우미는 만다라트 헤더에 있다
    await selectPlan(page, MANDALART.title);
    await page.locator('button[title="AI 어시스턴트"]').click();
    const ai = page.getByPlaceholder('메시지를 입력하세요...');
    await ai.tap();
    await ai.fill('짧은 메모');
    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForTimeout(200);
    await expect(ai).toHaveValue('짧은 메모');
    await expect(ai).toBeFocused();
    const b = await box(ai);
    expect(b.y + b.height).toBeLessThanOrEqual(420);
    await expect(page.getByRole('button', { name: 'AI 어시스턴트 닫기' })).toBeInViewport();
  });
});

const mobileOverview = (page: Page) => page.locator('#mandalart-grid-mobile');
const mobileDetail = (page: Page) => page.locator('#mandalart-mobile-detail');
/** 편집 칸에 초점이 있으면 iPhone 화상 키보드가 뜬다 */
const editingFocused = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
});
function savedCells(harness: Harness, cells: [string, number][]) {
  const saved = harness.records.get(`mandalart:${MANDALART.id}`)!.data as MandalartData;
  return cells.map(([grid, index]) => saved.grids.find((g) => g.id === grid)!.cells[index].value);
}

test.describe('터치 390px 만다라트 개요·상세', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('빈 개요 칸은 첫 탭에 그 자리에서 입력(한글 조합 포함), 입력 중 칸·초점·위치 유지·저장, 나오면 버튼이 되어 탭하면 키보드 없이 상세로', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // 상세로 가는 스크롤 요청 횟수
    await page.addInitScript(() => {
      const counter = window as unknown as { mwScrollCalls: number };
      counter.mwScrollCalls = 0;
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args) {
        counter.mwScrollCalls += 1;
        return original.apply(this, args);
      };
    });
    const scrollCalls = () => page.evaluate(() => (window as unknown as { mwScrollCalls: number }).mwScrollCalls);
    const harness = await setup(page);
    await selectPlan(page, MANDALART.title);
    const overview = mobileOverview(page);
    // 빈 하위 목표 8칸과 (채워진) 핵심 목표는 입력 칸
    await expect(overview.getByRole('textbox')).toHaveCount(9);
    await expect(overview.getByRole('textbox', { name: '핵심 목표', exact: true })).toHaveValue('가상 핵심 목표');
    await keepScreenshot(page, 'mandalart-overview-390');

    // 한 번 탭으로 바로 입력(추가 탭 없음)
    const input = overview.getByRole('textbox', { name: '하위 목표 1', exact: true });
    await input.tap();
    await expect(input).toBeFocused();
    const handle = (await input.elementHandle())!;
    // 위쪽 저장 상태 줄이 생기며 문서 전체가 내려갈 수 있어 개요 기준 위치로 잰다
    const offsetInOverview = async () => (await box(input)).y - (await box(overview)).y;
    const offset = await offsetInOverview();
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.keyboard.type('가상 ');
    // 한글 조합 입력(조합 중 글자 → 확정)
    const cdp = await page.context().newCDPSession(page);
    for (const [composing, committed] of [['ㅎ', '하'], ['ㅇ', '위']]) {
      await cdp.send('Input.imeSetComposition', { text: composing, selectionStart: 1, selectionEnd: 1 });
      await cdp.send('Input.imeSetComposition', { text: committed, selectionStart: 1, selectionEnd: 1 });
      await cdp.send('Input.insertText', { text: committed });
    }
    await cdp.detach();
    // 같은 입력 칸이 초점을 유지하고(다시 만들어지지 않음) 펼치기·스크롤·위치 이동이 없다
    await expect(input).toHaveValue('가상 하위');
    expect(await handle.evaluate((el) => el.isConnected && document.activeElement === el)).toBe(true);
    expect(await scrollCalls()).toBe(0);
    await expect(mobileDetail(page)).toHaveCount(0);
    expect(Math.abs((await offsetInOverview()) - offset)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    // 가상 DB 확인 응답(중앙 칸·외곽 가운데 동기화) 뒤에도 입력 중이다
    await expect.poll(() => savedCells(harness, [['center', 0], ['top-left', 4]])).toEqual(['가상 하위', '가상 하위']);
    expect(await handle.evaluate((el) => document.activeElement === el)).toBe(true);

    // 나오면 버튼. 누르면 키보드 없이 상세가 펼쳐져 화면에 들어온다
    await input.blur();
    const sub1 = overview.getByRole('button', { name: '하위 목표 1: 가상 하위' });
    await expect(sub1).toBeVisible();
    await sub1.tap();
    await expect(sub1).toHaveAttribute('aria-expanded', 'true');
    await expect(sub1).toHaveAttribute('aria-controls', 'mandalart-mobile-detail');
    const detail = mobileDetail(page);
    await expect(detail).toHaveAttribute('aria-label', '하위 목표 1 상세');
    await expect(detail).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await scrollCalls()).toBe(1);
    expect(await editingFocused(page)).toBe(false);
    await expect(detail.locator('textarea:disabled')).toHaveCount(0);

    const action = detail.locator('textarea').first();
    await action.tap();
    await action.fill('가상 실천');
    expect(await scrollCalls()).toBe(1);
    await keepScreenshot(page, 'mandalart-detail-390');
    await expect.poll(() => savedCells(harness, [['top-left', 0]])).toEqual(['가상 실천']);
    expect(harness.unexpected).toEqual([]);
  });

  test('공백만·이모지만 있는 칸과 빈 핵심 목표도 바로 입력, 글자가 있는 칸은 키보드 없이 상세', async ({ page }) => {
    const harness = await setup(page, {
      2: { value: '기존 목표' }, 4: { value: '' }, 5: { value: '   ' }, 8: { value: '', icon: '🎯' },
    });
    await selectPlan(page, MANDALART.title);
    const overview = mobileOverview(page);

    const existing = overview.getByRole('button', { name: '하위 목표 3: 기존 목표' });
    await existing.tap();
    await expect(mobileDetail(page)).toHaveAttribute('aria-label', '하위 목표 3 상세');
    expect(await editingFocused(page)).toBe(false);
    await mobileDetail(page).getByRole('button', { name: '상세 닫기' }).tap();
    await expect(existing).toBeFocused();

    const blank = overview.getByRole('textbox', { name: '하위 목표 5', exact: true });
    await blank.tap();
    await expect(blank).toBeFocused();

    const iconOnly = overview.getByRole('textbox', { name: '하위 목표 8', exact: true });
    await iconOnly.tap();
    await expect(iconOnly).toBeFocused();
    await page.keyboard.type('아이콘');
    await iconOnly.blur();
    await expect(overview.getByRole('button', { name: '하위 목표 8: 아이콘' })).toContainText('🎯');

    const main = overview.getByRole('textbox', { name: '핵심 목표', exact: true });
    await main.tap();
    await expect(main).toBeFocused();
    await page.keyboard.type('새 핵심');
    await expect(main).toBeFocused();
    await expect(mobileDetail(page)).toHaveCount(0);

    await expect.poll(() => savedCells(harness, [['center', 8], ['bottom-right', 4], ['center', 4]])).toEqual(['아이콘', '아이콘', '새 핵심']);
    const saved = harness.records.get(`mandalart:${MANDALART.id}`)!.data as MandalartData;
    expect(saved.grids.find((g) => g.id === 'center')!.cells[8].icon).toBe('🎯');
    expect(harness.unexpected).toEqual([]);
  });

  test('정중앙 핵심 목표는 채워져 있고 이모지가 있어도 첫 탭에 그 자리에서 편집, 펼치기·스크롤 없음, 도구는 겹치지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const counter = window as unknown as { mwScrollCalls: number };
      counter.mwScrollCalls = 0;
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args) {
        counter.mwScrollCalls += 1;
        return original.apply(this, args);
      };
    });
    const scrollCalls = () => page.evaluate(() => (window as unknown as { mwScrollCalls: number }).mwScrollCalls);
    const harness = await setup(page, { 0: { value: '목표 하나' }, 4: { value: '가상 핵심 목표', icon: '🎯' } });
    await selectPlan(page, MANDALART.title);
    const overview = mobileOverview(page);
    const main = overview.getByRole('textbox', { name: '핵심 목표', exact: true });
    await expect(main).toHaveValue('가상 핵심 목표');
    await expect(overview.getByRole('button', { name: /^핵심 목표/ })).toHaveCount(0);

    await main.tap();
    await expect(main).toBeFocused();
    await main.press('End');
    await page.keyboard.type(' 추가');
    await expect(main).toBeFocused();
    await expect(main).toHaveValue('가상 핵심 목표 추가');
    await expect(mobileDetail(page)).toHaveCount(0);
    expect(await scrollCalls()).toBe(0);
    await expect.poll(() => savedCells(harness, [['center', 4]])).toEqual(['가상 핵심 목표 추가']);
    const savedMain = () => (harness.records.get(`mandalart:${MANDALART.id}`)!.data as MandalartData).grids.find((g) => g.id === 'center')!.cells[4];
    expect(savedMain().icon).toBe('🎯');

    // 이모지·초기화 도구는 터치에서 보이고 서로의 히트 영역이 겹치지 않는다
    const mainCell = main.locator('xpath=..');
    const emoji = mainCell.locator('button[title="이모지 선택"]');
    const clear = mainCell.locator('button[title="초기화"]');
    for (const [tool, title] of [[emoji, '이모지 선택'], [clear, '초기화']] as const) {
      await expect(tool).toHaveCSS('opacity', '1');
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('title'), center(await box(tool)));
      expect(hit).toBe(title);
    }
    expect((await box(clear)).y - ((await box(emoji)).y + (await box(emoji)).height)).toBeGreaterThan(20);
    await keepScreenshot(page, 'mandalart-main-inline-390');

    // 하위 목표 상세가 열린 채로 핵심 목표를 고쳐도 상세는 그대로이고 다시 스크롤하지 않는다
    await overview.getByRole('button', { name: '하위 목표 1: 목표 하나' }).tap();
    await expect(mobileDetail(page)).toHaveAttribute('aria-label', '하위 목표 1 상세');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const before = await scrollCalls();
    await main.tap();
    await page.keyboard.type('!');
    await expect(main).toBeFocused();
    await expect(mobileDetail(page)).toHaveAttribute('aria-label', '하위 목표 1 상세');
    expect(await scrollCalls()).toBe(before);
    await expect.poll(() => savedCells(harness, [['center', 4]])).toEqual([await main.inputValue()]);

    // 중앙 그리드 색상은 개요 아래 버튼
    await overview.getByRole('button', { name: '중앙 그리드 색상 변경' }).tap();
    await expect(page.getByRole('button', { name: /^Select color / }).first()).toBeVisible();
    expect(harness.unexpected).toEqual([]);
  });

  test('다른 칸 선택·같은 칸 다시 선택 시 스크롤, 닫으면 개요 버튼으로 초점, 플랜 전환 후 선택 없음', async ({ page }) => {
    await setup(page, { 0: { value: '목표 하나' }, 1: { value: '목표 둘' } });
    await selectPlan(page, MANDALART.title);
    const sub1 = mobileOverview(page).getByRole('button', { name: '하위 목표 1: 목표 하나' });
    const sub2 = mobileOverview(page).getByRole('button', { name: '하위 목표 2: 목표 둘' });
    const detail = mobileDetail(page);
    await sub1.tap();
    await expect(detail).toHaveAttribute('aria-label', '하위 목표 1 상세');
    await sub2.tap();
    await expect(sub1).toHaveAttribute('aria-expanded', 'false');
    await expect(sub2).toHaveAttribute('aria-expanded', 'true');
    await expect(detail).toHaveAttribute('aria-label', '하위 목표 2 상세');
    await expect(detail).toBeInViewport({ ratio: 1 });

    // 같은 칸을 다시 고르면 다시 상세로 스크롤한다(부드러운 스크롤)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(detail).not.toBeInViewport({ ratio: 1 });
    await sub2.tap();
    await expect(detail).toBeInViewport({ ratio: 1 });
    expect(await editingFocused(page)).toBe(false);

    await detail.getByRole('button', { name: '상세 닫기' }).tap();
    await expect(detail).toHaveCount(0);
    await expect(sub2).toBeFocused();
    await expect(sub2).toHaveAttribute('aria-expanded', 'false');

    // 상세에서 하위 목표를 비우면 개요 칸은 입력 칸이 되고, 닫아도 그 칸에 초점(키보드)을 주지 않는다
    await sub1.tap();
    const clear = detail.locator('button[title="초기화"]');
    await clear.tap();
    await detail.locator('button[title="클릭하여 삭제"]').tap();
    await expect(mobileOverview(page).getByRole('textbox', { name: '하위 목표 1', exact: true })).toBeVisible();
    await expect(detail).toHaveAttribute('aria-label', '하위 목표 1 상세');
    await detail.getByRole('button', { name: '상세 닫기' }).tap();
    await expect(detail).toHaveCount(0);
    expect(await editingFocused(page)).toBe(false);

    await sub2.tap();
    await expect(detail).toBeVisible();
    await selectPlan(page, DAILY.title);
    await selectPlan(page, MANDALART.title);
    await expect(detail).toHaveCount(0);
    await expect(mobileOverview(page).locator('[aria-expanded="true"]')).toHaveCount(0);
  });
});

const homeButton = (page: Page) => sidebar(page).getByRole('button', { name: '홈', exact: true });
const planQuery = (page: Page) => {
  const params = new URL(page.url()).searchParams;
  return { template: params.get('template'), plan: params.get('plan') };
};
async function expectHome(page: Page) {
  await expect(page.getByRole('heading', { name: '오늘 할 일' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '최근 작업' })).toBeVisible();
  expect(planQuery(page)).toEqual({ template: null, plan: null });
}

test.describe('사이드바 홈 360px (터치)', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('편집 중 홈 → 오늘 할 일·최근 작업, 사이드바 닫힘, 주소 비움, 뒤로/앞으로 복귀, 저장 대기 수정은 저장되고 생성·삭제 없음', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const harness = await setup(page);
    await selectPlan(page, MANDALART.title);
    expect(planQuery(page)).toEqual({ template: 'mandalart', plan: MANDALART.id });

    // 저장 대기(디바운스) 중인 수정을 남긴 채 바로 홈으로 간다
    const goal = mobileOverview(page).getByRole('textbox', { name: '하위 목표 1', exact: true });
    await goal.tap();
    await goal.fill('홈 전 수정');
    await page.locator('button[title="사이드바 열기"]').click();
    const home = homeButton(page);
    await expect(home).not.toHaveAttribute('aria-current', /./);
    const b = await box(home);
    expect(b.height).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
    // 아직 가상 DB에 닿지 않은 수정이다
    expect(savedCells(harness, [['center', 0]])).toEqual(['']);
    await expect.poll(async () => (await box(sidebar(page))).x).toBeGreaterThanOrEqual(0);
    await keepScreenshot(page, 'sidebar-home-360');
    await home.tap();

    await expect.poll(async () => {
      const aside = (await sidebar(page).boundingBox())!;
      return aside.x + aside.width;
    }).toBeLessThanOrEqual(1);
    await expectHome(page);
    await expect(home).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#mandalart-grid')).toHaveCount(0);
    await keepScreenshot(page, 'home-360');
    await expect.poll(() => savedCells(harness, [['center', 0], ['top-left', 4]])).toEqual(['홈 전 수정', '홈 전 수정']);

    // 뒤로: 보던 플랜, 앞으로: 다시 홈
    await page.goBack();
    await expect(page.locator('header input').first()).toHaveValue(MANDALART.title);
    expect(planQuery(page)).toEqual({ template: 'mandalart', plan: MANDALART.id });
    await expect(mobileOverview(page).getByRole('button', { name: '하위 목표 1: 홈 전 수정' })).toBeVisible();
    await page.goForward();
    await expectHome(page);

    // 플랜 생성·삭제 없음, 저장은 수정한 만다라트만
    expect([...harness.records.keys()].sort()).toEqual(['block6:mw-block6', 'daily:mw-daily', 'mandalart:mw-mandalart']);
    expect(harness.commits.length).toBeGreaterThan(0);
    expect(harness.commits.every((c) => c.key === `mandalart:${MANDALART.id}` && !c.deleted)).toBe(true);
    expect(harness.unexpected).toEqual([]);
  });
});

test.describe('데스크탑 1440px (마우스)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('사이드바 홈: 플랜에서 홈으로, 초점 링·aria-current, 뒤로 가면 플랜, 쓰기 없음', async ({ page }) => {
    const harness = await setup(page);
    const home = homeButton(page);
    await expect(home).toHaveAttribute('aria-current', 'page');
    await selectPlan(page, DAILY.title);
    await expect(home).not.toHaveAttribute('aria-current', /./);
    await home.click();
    await expectHome(page);
    await expect(home).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page)).toBeInViewport();
    // 키보드 초점 링
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(home).toBeFocused();
    await expect(home).not.toHaveCSS('box-shadow', 'none');
    await page.goBack();
    await expect(page.locator('header input').first()).toHaveValue(DAILY.title);
    expect(planQuery(page)).toEqual({ template: 'daily', plan: DAILY.id });
    expect(harness.commits).toEqual([]);
    expect(harness.unexpected).toEqual([]);
  });

  test('Mandalart는 그대로 81칸을 직접 눌러 편집한다 (모바일 개요 숨김)', async ({ page }) => {
    await setup(page);
    await selectPlan(page, MANDALART.title);
    await expect(mobileOverview(page)).toBeHidden();
    const desktop = page.locator('#mandalart-grid-desktop');
    await expect(desktop.locator('textarea')).toHaveCount(81);
    const enabledSubs = desktop.locator('textarea[placeholder="하위 목표"]:not([disabled])');
    await expect(enabledSubs).toHaveCount(8);
    const firstSub = enabledSubs.first();
    await firstSub.click();
    await expect(firstSub).toBeFocused();
    await page.keyboard.type('데스크탑');
    // 중앙 하위 목표 입력으로 외곽 그리드(가운데 칸 포함)가 열린다
    await expect(enabledSubs).toHaveCount(9);
    await expect(desktop.locator('textarea:disabled')).toHaveCount(63);
  });

  test('Daily 삭제는 평소 숨김·키보드 초점이 행에 오면 보이고, 조작 크기는 그대로 작다', async ({ page }) => {
    await setup(page);
    await selectPlan(page, DAILY.title);
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(false);
    const remove = page.getByRole('button', { name: '둘째 할 일 삭제' });
    await expect(remove).toHaveCSS('opacity', '0');
    expect((await box(remove)).height).toBeLessThan(30);
    expect((await box(page.getByRole('button', { name: '첫째 할 일 순서 변경' }))).height).toBeLessThan(30);
    await page.getByRole('button', { name: '둘째 할 일 완료' }).focus();
    await expect(remove).toHaveCSS('opacity', '1');
    await expect(page.getByPlaceholder('할 일을 입력하세요...')).toHaveCSS('font-size', '14px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
