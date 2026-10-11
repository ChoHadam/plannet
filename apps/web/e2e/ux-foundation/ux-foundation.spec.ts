import { test, expect, Page, Locator } from '@playwright/test';
import fs from 'node:fs/promises';
import { GRID_POSITIONS, MandalartData } from '../../src/types/mandalart';
import { DailyData } from '../../src/types/daily';
import { Block6Data, BlockNumber, DAYS_OF_WEEK } from '../../src/types/block6';
import { MonthlyData } from '../../src/types/monthly';
import { DEFAULT_COLORS } from '../../src/lib/constants';
import { lazyComponent } from '../../src/lib/lazyComponent';

/**
 * UI 기본 조작 회귀 (docs/ui-ux-review.md 1순위 묶음).
 *
 * - 로그인한 서비스 모드. 인증·DB·AI는 모두 브라우저에서 가로챈 가상 응답이며 실제 서버·계정·AI에 닿지 않는다.
 * - 한글 조합은 Chromium에 isComposing / keyCode 229 keydown을 합성해 재현한다. 실제 OS 입력기·Safari는 별도 확인 대상이다.
 */

const FIXED_TIME = '2026-09-30T00:00:00.000Z';
const USER_ID = 'c3c3c3c3-0000-4000-8000-00000000000c';
const USER = { name: '가상 사용자', email: 'synthetic.tablet.reviewer@example.test' };
const WIDTHS = [360, 768, 820, 1024, 1440];
const MOBILE_MAX = 767;

const DAILY: DailyData = {
  id: 'ux-daily', title: 'UX 일간', template: 'daily', category: 'daily', year: 2026, month: 9, day: 30,
  todos: [
    { id: 'ux-todo-1', text: '가상 할 일', completed: false },
    { id: 'ux-todo-2', text: '두 번째 할 일', completed: true },
  ],
  memo: '', createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
};

const MANDALART: MandalartData = {
  id: 'ux-mandalart', title: 'UX 만다라트', template: 'mandalart', category: 'annual', year: 2026,
  createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
  grids: GRID_POSITIONS.map((position) => ({
    id: position, color: DEFAULT_COLORS[position],
    cells: Array.from({ length: 9 }, (_, i) => ({
      id: `${position}-${i}`, position: i, value: position === 'center' && i === 4 ? '가상 핵심 목표' : '',
    })),
  })),
};

const BLOCK6: Block6Data = {
  id: 'ux-block6', title: 'UX 주간', template: 'block6', category: 'weekly', year: 2026, month: 9, week: 4,
  blocks: DAYS_OF_WEEK.flatMap((day) => ([1, 2, 3, 4, 5, 6] as BlockNumber[]).map((blockNumber) => ({
    id: `${day}-${blockNumber}`, day, blockNumber, keyword: '', todos: [],
  }))),
  backlog: [], createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
};

const MONTHLY: MonthlyData = {
  id: 'ux-monthly', title: 'UX 월간', template: 'monthly', category: 'monthly', year: 2026, month: 8,
  goals: [{ id: 'ux-goal-1', text: '가상 월간 목표', progress: 30, completed: false }],
  weeklyFocus: [1, 2, 3, 4, 5].map((weekNumber) => ({ weekNumber, text: `가상 W${weekNumber} 포커스` })),
  memo: '가상 메모', createdAt: FIXED_TIME, updatedAt: FIXED_TIME,
};

const SEEDED = [['daily', DAILY], ['mandalart', MANDALART], ['block6', BLOCK6], ['monthly', MONTHLY]] as const;

interface Harness {
  chatRequests: string[];
  unexpected: string[];
  /** 모의 DB 기록 (kind:id) */
  records: Map<string, unknown>;
  commits: number;
}

async function setup(page: Page): Promise<Harness> {
  const records = new Map<string, { kind: string; id: string; schemaVersion: 1; version: number; deleted: boolean; data: unknown; updatedAt: string }>();
  const harness: Harness = { chatRequests: [], unexpected: [], records, commits: 0 };
  for (const [kind, plan] of SEEDED) {
    records.set(`${kind}:${plan.id}`, { kind, id: plan.id, schemaVersion: 1, version: 1, deleted: false, data: plan, updatedAt: FIXED_TIME });
  }

  // 나중에 등록한 route가 먼저 처리된다. 알 수 없는 API·외부 요청은 막고 기록한다.
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
  await page.route('**/api/v1/me', (route) => route.fulfill({
    json: {
      authenticated: true, storageEnabled: true,
      user: { authProvider: 'google', externalSubject: 'ux-foundation', name: USER.name, email: USER.email, userId: USER_ID },
    },
  }));
  await page.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-UX-CSRF', token: 'ux-token' } }));
  await page.route('**/api/v1/planner', (route) => route.fulfill({ json: { userId: USER_ID, records: [...records.values()] } }));
  await page.route('**/api/v1/planner/commit', (route) => {
    harness.commits += 1;
    const { changes } = route.request().postDataJSON() as { changes: { kind: string; id: string; expectedVersion: number; data: unknown }[] };
    const saved = changes.map((change) => ({
      kind: change.kind, id: change.id, schemaVersion: 1 as const, version: change.expectedVersion + 1,
      deleted: change.data === null, data: change.data, updatedAt: FIXED_TIME,
    }));
    saved.forEach((record) => records.set(`${record.kind}:${record.id}`, record));
    return route.fulfill({ json: { records: saved } });
  });
  // 실제 AI를 부르지 않는다. 요청 본문만 기록하고 가상 응답을 돌려준다.
  await page.route('**/api/chat', (route) => {
    harness.chatRequests.push(route.request().postData() ?? '');
    return route.fulfill({
      json: {
        message: '가상 응답입니다', action: 'none', data: null,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUSD: '0.000000' },
      },
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  return harness;
}

const isMobile = (page: Page) => page.viewportSize()!.width <= MOBILE_MAX;
const sidebar = (page: Page) => page.locator('aside');
const openToggle = (page: Page) => page.locator('button[title="사이드바 열기"]');
const planButton = (page: Page, title: string) =>
  sidebar(page).getByRole('button', { name: title }).filter({ hasText: title }).first();

async function selectPlan(page: Page, title: string) {
  if (isMobile(page)) await openToggle(page).click();
  await planButton(page, title).click();
  await expect(page.locator('header input').first()).toHaveValue(title);
  if (isMobile(page)) {
    await expect(openToggle(page)).toBeVisible();
    await expectSidebarOffscreen(page);
  }
}

/** 모바일 사이드바가 닫히는 전환(300ms)이 끝나 화면 밖에 있다 */
async function expectSidebarOffscreen(page: Page) {
  await expect.poll(async () => {
    const box = (await sidebar(page).boundingBox())!;
    return box.x + box.width;
  }).toBeLessThanOrEqual(1);
}

/** 문서 가로 넘침과, 페이지(또는 main) 스크롤에 속한 조작 요소 중 화면 밖에 있는 것 */
async function measureLayout(page: Page) {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const main = document.querySelector('main')!;
    const internalScroller = (el: Element) => {
      for (let node = el.parentElement; node && node !== main && node !== document.body; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };
    const offscreen = [...document.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')]
      .filter((el) => !el.closest('aside') && !el.closest('[role="dialog"]') && !internalScroller(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > viewport + 1 || r.left < -1);
      })
      .map((el) => el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.textContent?.trim().slice(0, 20));
    return {
      pageOverflow: document.documentElement.scrollWidth - viewport,
      mainOverflow: main.scrollWidth - main.clientWidth,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
      offscreen,
    };
  });
}

async function expectInViewport(page: Page, locator: Locator) {
  const width = page.viewportSize()!.width;
  const box = await locator.boundingBox();
  expect(box, 'element should be rendered').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
}

test.describe('반응형 폭', () => {
  for (const width of WIDTHS) {
    test(`${width}px: 페이지 가로 넘침 없이 계정·주요 조작이 화면 안에 있다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await setup(page);

      await selectPlan(page, DAILY.title);
      const layout = await measureLayout(page);
      expect(layout.pageOverflow).toBeLessThanOrEqual(0);
      expect(layout.mainOverflow).toBeLessThanOrEqual(0);
      expect(layout.offscreen).toEqual([]);
      // 넘침을 잘라 숨기는 방식으로 통과하지 않는다.
      expect(layout.bodyOverflowX).not.toBe('hidden');
      expect(layout.htmlOverflowX).not.toBe('hidden');

      await expectInViewport(page, page.getByRole('button', { name: '로그아웃' }));
      await expectInViewport(page, page.getByPlaceholder('할 일을 입력하세요...'));
      // 계정 구분: 이메일이 숨겨지지 않고, 잘리더라도 title로 전체 주소를 확인할 수 있다.
      const email = page.getByTestId('auth-account-email');
      await expect(email).toBeVisible();
      await expect(email).toHaveText(USER.email);
      await expect(email).toHaveAttribute('title', USER.email);
      await expectInViewport(page, email);
      expect((await email.boundingBox())!.width).toBeGreaterThanOrEqual(100);

      await page.screenshot({ path: test.info().outputPath(`daily-${width}.png`), fullPage: true });

      // 넓은 템플릿은 페이지가 아니라 그리드 안에서 가로 스크롤한다.
      for (const title of [MANDALART.title, BLOCK6.title]) {
        await selectPlan(page, title);
        const wide = await measureLayout(page);
        expect(wide.pageOverflow, title).toBeLessThanOrEqual(0);
        expect(wide.offscreen, title).toEqual([]);
        await expectInViewport(page, page.getByRole('button', { name: '로그아웃' }));
        await page.screenshot({ path: test.info().outputPath(`${title === MANDALART.title ? 'mandalart' : 'block6'}-${width}.png`), fullPage: true });
      }

      // Monthly: 주요 입력과 달력이 페이지 넘침 없이 화면 안에 있고 날짜 칸을 누를 수 있는 크기다.
      await selectPlan(page, MONTHLY.title);
      const monthly = await measureLayout(page);
      expect(monthly.pageOverflow, MONTHLY.title).toBeLessThanOrEqual(0);
      expect(monthly.mainOverflow, MONTHLY.title).toBeLessThanOrEqual(0);
      expect(monthly.offscreen, MONTHLY.title).toEqual([]);
      for (const control of [
        page.getByRole('button', { name: '로그아웃' }),
        page.locator('button[title="이전 달"]'),
        page.locator('button[title="다음 달"]'),
        page.getByPlaceholder('새 목표 추가...'),
        // 주간 포커스는 내용이 있으면 텍스트로 표시된다(달력 옆 표시와 포커스 목록 두 곳)
        page.getByText('가상 W5 포커스').last(),
        page.getByPlaceholder('자유롭게 메모하세요...'),
      ]) {
        await expectInViewport(page, control);
      }
      const main = page.locator('main');
      for (const day of ['1', '31']) {
        const cell = main.getByRole('button', { name: day, exact: true });
        await expectInViewport(page, cell);
        expect((await cell.boundingBox())!.width, `day ${day}`).toBeGreaterThanOrEqual(24);
      }
      await page.screenshot({ path: test.info().outputPath(`monthly-${width}.png`), fullPage: true });
      expect(harness.unexpected).toEqual([]);
    });
  }
});

/**
 * 배경 조작 격리: 대화상자가 열린 동안 배경 요소에 프로그램으로 초점을 줘도(보조기기·스크립트 경로)
 * 초점이 대화상자로 돌아오고, 이어진 입력이 배경을 바꾸지 않으며, Tab·Esc가 대화상자 기준으로 동작한다.
 */
async function expectBackgroundFocusBlocked(page: Page, dialog: Locator, backgrounds: Locator[]) {
  for (const background of backgrounds) {
    await background.evaluate((el) => (el as HTMLElement).focus());
    await expectFocusInside(dialog);
    await expect(background).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expectFocusInside(dialog);
  }
}

/** 현재 초점이 주어진 대화상자 안에 있다 */
async function expectFocusInside(dialog: Locator) {
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
}

/** Tab을 focusable 수보다 넉넉히 눌러도 초점이 대화상자 밖으로 나가지 않는다 */
async function expectTabContained(page: Page, dialog: Locator, key: 'Tab' | 'Shift+Tab') {
  const count = await dialog.locator('button:not([disabled]), input:not([disabled]), select, textarea').count();
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
}

test.describe('생성 모달 키보드', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('템플릿 → (선택: 사용법) → 날짜: 이름·초점 진입·Tab 순환·Esc·초점 복귀', async ({ page }) => {
    const harness = await setup(page);
    const plus = page.locator('button[title="새로 만들기"]').nth(3);
    await plus.focus();
    await page.keyboard.press('Enter');

    const templateDialog = page.getByRole('dialog', { name: '일간 플랜 만들기' });
    await expect(templateDialog).toBeVisible();
    await expect(templateDialog).toHaveAttribute('aria-modal', 'true');
    await expectFocusInside(templateDialog);
    await expectTabContained(page, templateDialog, 'Tab');
    await expectTabContained(page, templateDialog, 'Shift+Tab');

    // Esc로 닫으면 연 + 버튼으로 돌아온다
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeHidden();
    await expect(plus).toBeFocused();

    // 다시 열어 키보드로 템플릿 선택 → 날짜 선택
    await page.keyboard.press('Enter');
    await expectFocusInside(templateDialog);
    await templateDialog.getByRole('button', { name: /투두리스트/ }).first().focus();
    await page.keyboard.press('Enter');
    const dateDialog = page.getByRole('dialog', { name: '날짜 선택' });
    await expect(dateDialog).toBeVisible();
    await expect(templateDialog).toBeHidden();
    await expectFocusInside(dateDialog);
    await expectTabContained(page, dateDialog, 'Tab');

    // 날짜 단계의 Esc는 템플릿 선택으로 돌아간다
    await page.keyboard.press('Escape');
    await expect(dateDialog).toBeHidden();
    await expect(templateDialog).toBeVisible();
    await expectFocusInside(templateDialog);

    // 가이드는 생성 단계가 아니라 템플릿 선택의 사용법 버튼으로 연다. 시작하기는 날짜 선택으로 이어진다.
    await templateDialog.getByRole('button', { name: '투두리스트 사용법 보기' }).focus();
    await page.keyboard.press('Enter');
    const guide = page.getByRole('dialog', { name: '투두리스트 사용법' });
    await expect(guide).toBeVisible();
    await expect(templateDialog).toBeHidden();
    await expectFocusInside(guide);
    await expectTabContained(page, guide, 'Shift+Tab');
    await guide.getByRole('button', { name: '시작하기' }).focus();
    await page.keyboard.press('Enter');
    await expect(guide).toBeHidden();
    await expectFocusInside(dateDialog);

    await dateDialog.getByRole('button', { name: '확인', exact: true }).focus();
    await page.keyboard.press('Enter');
    // 날짜 확인이 마지막 단계: 가이드 없이 바로 편집기
    await expect(guide).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByPlaceholder('할 일을 입력하세요...')).toBeVisible();
    // 데스크탑은 사이드바를 유지하고 초점은 생성을 시작한 + 버튼으로 돌아온다
    await expect(plus).toBeFocused();
    await expect(sidebar(page)).not.toHaveAttribute('inert', '');
    expect(harness.unexpected).toEqual([]);
  });

  test('생성 취소는 어느 단계에서도 플랜을 저장하지 않고, 이후 키보드만으로 생성할 수 있다', async ({ page }) => {
    const harness = await setup(page);
    const libraryButton = page.getByRole('button', { name: /^전체 플랜 보기/ });
    await expect(libraryButton).toHaveAccessibleName(`전체 플랜 보기 (${SEEDED.length}개)`);
    const plus = page.locator('button[title="새로 만들기"]').nth(3);
    const templateDialog = page.getByRole('dialog', { name: '일간 플랜 만들기' });
    const dateDialog = page.getByRole('dialog', { name: '날짜 선택' });
    const guide = page.getByRole('dialog', { name: '투두리스트 사용법' });
    const chooseDaily = async () => {
      await templateDialog.getByRole('button', { name: /투두리스트/ }).first().focus();
      await page.keyboard.press('Enter');
    };

    // 1) 템플릿 단계 Esc  2) 날짜 단계 Esc → 템플릿 Esc  3) 사용법(가이드) Esc → 템플릿 Esc
    await plus.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeHidden();

    await page.keyboard.press('Enter');
    await chooseDaily();
    await expectFocusInside(dateDialog);
    await page.keyboard.press('Escape');
    await expectFocusInside(templateDialog);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expectFocusInside(templateDialog);
    await templateDialog.getByRole('button', { name: '투두리스트 사용법 보기' }).focus();
    await page.keyboard.press('Enter');
    await expectFocusInside(guide);
    await page.keyboard.press('Escape');
    await expectFocusInside(templateDialog);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(plus).toBeFocused();

    // 자동 저장 대기(650ms)보다 넉넉히 기다려도 새 기록·저장 요청이 없다
    await page.waitForTimeout(1500);
    expect(harness.commits).toBe(0);
    expect(harness.records.size).toBe(SEEDED.length);
    await expect(libraryButton).toHaveAccessibleName(`전체 플랜 보기 (${SEEDED.length}개)`);

    // 키보드만: Enter → 템플릿 Enter → 날짜에서 Tab으로 확인 → Enter (가이드 없이 생성)
    await page.keyboard.press('Enter');
    await chooseDaily();
    await expectFocusInside(dateDialog);
    const confirm = dateDialog.getByRole('button', { name: '확인', exact: true });
    for (let i = 0; i < 60 && !(await confirm.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(guide).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByPlaceholder('할 일을 입력하세요...')).toBeVisible();
    await expect.poll(() => harness.records.size).toBe(SEEDED.length + 1);
    await expect(libraryButton).toHaveAccessibleName(`전체 플랜 보기 (${SEEDED.length + 1}개)`);
  });

  test('Tab 순환은 tabindex=-1·inert 요소를 건너뛴다 (합성 요소 주입)', async ({ page }) => {
    await setup(page);
    await page.locator('button[title="새로 만들기"]').nth(3).click();
    const templateDialog = page.getByRole('dialog', { name: '일간 플랜 만들기' });
    await expectFocusInside(templateDialog);
    // 현재 앱 모달에는 해당 요소가 없어 테스트가 대화상자 끝에 직접 넣는다.
    await templateDialog.evaluate((dialog) => {
      const skipped = document.createElement('button');
      skipped.tabIndex = -1;
      skipped.textContent = '건너뛸 버튼';
      const inertBox = document.createElement('div');
      inertBox.inert = true;
      inertBox.innerHTML = '<button>inert 버튼</button>';
      dialog.append(skipped, inertBox);
    });
    const cancel = templateDialog.getByRole('button', { name: '취소', exact: true });
    await cancel.focus();
    await page.keyboard.press('Tab');
    await expect(templateDialog.getByRole('button', { name: /투두리스트/ }).first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeHidden();
  });

  test('배경 격리: 템플릿·날짜 모달이 열린 동안 배경에 준 초점은 모달로 돌아오고, 닫은 뒤에는 풀린다', async ({ page }) => {
    await setup(page);
    await selectPlan(page, DAILY.title);
    const titleInput = page.locator('header input').first();
    const backgrounds = [titleInput, planButton(page, MANDALART.title), page.getByRole('button', { name: '로그아웃' })];
    const plus = page.locator('button[title="새로 만들기"]').nth(3);
    await plus.focus();
    await page.keyboard.press('Enter');

    const templateDialog = page.getByRole('dialog', { name: '일간 플랜 만들기' });
    await expectFocusInside(templateDialog);
    await expectBackgroundFocusBlocked(page, templateDialog, backgrounds);
    // 배경에 초점을 시도한 뒤의 입력이 배경 제목을 바꾸지 않는다
    await titleInput.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.type('x');
    await expect(titleInput).toHaveValue(DAILY.title);

    await templateDialog.getByRole('button', { name: /투두리스트/ }).first().focus();
    await page.keyboard.press('Enter');
    const dateDialog = page.getByRole('dialog', { name: '날짜 선택' });
    await expectFocusInside(dateDialog);
    await expectBackgroundFocusBlocked(page, dateDialog, backgrounds);
    await page.keyboard.press('Escape');
    await expect(dateDialog).toBeHidden();
    await expectFocusInside(templateDialog);
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeHidden();
    await expect(plus).toBeFocused();

    // 닫은 뒤에는 배경 초점이 정상 동작한다 (정리 확인)
    await titleInput.focus();
    await expect(titleInput).toBeFocused();
  });

  test('보관함 위 복제 날짜 선택: Esc는 위 모달만 닫고 보관함 초점이 복원된다', async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: /^전체 플랜 보기/ }).click();
    const library = page.getByRole('dialog', { name: '전체 플랜' });
    await expect(library).toBeVisible();
    const duplicate = library.getByRole('button', { name: `${DAILY.title} 복제` });
    await duplicate.focus();
    await page.keyboard.press('Enter');

    const dateDialog = page.getByRole('dialog', { name: '날짜 선택' });
    await expectFocusInside(dateDialog);
    await expectTabContained(page, dateDialog, 'Tab');
    await expectBackgroundFocusBlocked(page, dateDialog, [library.getByRole('searchbox'), page.getByRole('button', { name: '로그아웃' })]);
    await page.keyboard.press('Escape');
    await expect(dateDialog).toBeHidden();
    await expect(library).toBeVisible();
    await expect(duplicate).toBeFocused();
    // 위 모달이 닫힌 뒤 보관함 조작이 다시 가능하다
    await library.getByRole('searchbox').focus();
    await expect(library.getByRole('searchbox')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(library).toBeHidden();
  });
});

test.describe('사이드바 초점', () => {
  test('데스크탑: 접으면 사이드바 항목이 Tab 순서에서 빠지고, 펼치면 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    const collapse = page.locator('button[title="사이드바 접기"]');
    await collapse.click();
    await expect(sidebar(page)).toHaveAttribute('inert', '');
    await expect(planButton(page, DAILY.title)).not.toBeInViewport();

    await page.locator('body').focus();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await sidebar(page).evaluate((el) => el.contains(document.activeElement))).toBe(false);
    }

    await openToggle(page).click();
    await expect(sidebar(page)).not.toHaveAttribute('inert', '');
    await planButton(page, DAILY.title).focus();
    await expect(planButton(page, DAILY.title)).toBeFocused();
    // 데스크탑 선택은 사이드바를 닫지 않는다
    await page.keyboard.press('Enter');
    await expect(page.locator('header input').first()).toHaveValue(DAILY.title);
    await expect(sidebar(page)).not.toHaveAttribute('inert', '');
  });

  test.describe('모바일', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('닫힌 사이드바는 초점을 받지 않고, 닫기 버튼으로 닫으면 열기 버튼으로 돌아온다', async ({ page }) => {
      await setup(page);
      await expect(sidebar(page)).toHaveAttribute('inert', '');
      await page.locator('body').focus();
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        expect(await sidebar(page).evaluate((el) => el.contains(document.activeElement))).toBe(false);
      }

      await openToggle(page).focus();
      await page.keyboard.press('Enter');
      const close = page.getByRole('button', { name: '사이드바 닫기' });
      await expect(close).toBeVisible();
      await expect(close).toBeFocused();
      // 사이드바가 밀려 들어오는 전환(300ms)이 끝난 뒤 위치를 잰다
      await expect.poll(async () => (await sidebar(page).boundingBox())!.x).toBe(0);
      await expectInViewport(page, close);
      const box = (await close.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(36);

      await page.keyboard.press('Enter');
      await expect(sidebar(page)).toHaveAttribute('inert', '');
      await expect(openToggle(page)).toBeFocused();
    });

    for (const flow of [
      { category: 3, template: /투두리스트/, guide: '투두리스트 사용법', editor: '나의 투두리스트' },
      { category: 0, template: /만다라트/, guide: '만다라트 사용법', editor: '나의 만다라트' },
      { category: 2, template: /Block 6/, guide: 'Block 6 사용법', editor: '나의 Block 6' },
      { category: 1, template: /월간 플래너/, guide: '월간 플래너 사용법', editor: '나의 월간 플래너' },
    ]) {
      test(`새 플랜 생성(${flow.editor}, ${flow.guide} 없이) 완료 후 사이드바가 닫히고 편집기가 보인다`, async ({ page }) => {
        await setup(page);
        await openToggle(page).click();
        await page.locator('button[title="새로 만들기"]').nth(flow.category).click();
        await page.getByRole('dialog').getByRole('button', { name: flow.template }).first().click();
        await page.getByRole('dialog', { name: '날짜 선택' }).getByRole('button', { name: '확인', exact: true }).click();
        // 가이드는 생성 단계에서 빠졌다. 날짜 확인 직후 편집기로 간다.
        await expect(page.getByRole('dialog', { name: flow.guide })).toHaveCount(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(sidebar(page)).toHaveAttribute('inert', '');
        await expectSidebarOffscreen(page);
        await expect(openToggle(page)).toBeVisible();
        const editor = page.getByPlaceholder(flow.editor);
        await expect(editor).toBeInViewport();
        // 편집기 위를 덮는 배경이 없어 바로 누를 수 있다
        await editor.click();
        await expect(editor).toBeFocused();
      });
    }
  });
});

/** 한글 조합 중 Enter keydown. keyCode 229만 오는 브라우저도 재현한다. */
async function pressComposingKey(locator: Locator, key: 'Enter' | 'Escape', variant: 'isComposing' | 'keyCode229') {
  await locator.evaluate((el, { key, variant }) => {
    const event = new KeyboardEvent('keydown', {
      key, code: key, bubbles: true, cancelable: true, isComposing: variant === 'isComposing',
    });
    if (variant === 'keyCode229') Object.defineProperty(event, 'keyCode', { get: () => 229 });
    el.dispatchEvent(event);
  }, { key, variant });
}

test.describe('한글 조합 Enter', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Daily 할 일 수정: 조합 중 Enter/Esc는 편집을 끝내지 않고, 일반 Enter는 저장한다', async ({ page }) => {
    await setup(page);
    await selectPlan(page, DAILY.title);
    await page.getByText('가상 할 일', { exact: true }).click();
    const edit = page.locator('input[type="text"].border-emerald-500');
    await expect(edit).toBeFocused();
    await edit.fill('수정한 할 일');

    for (const variant of ['isComposing', 'keyCode229'] as const) {
      await pressComposingKey(edit, 'Enter', variant);
      await expect(edit).toBeVisible();
      await expect(edit).toHaveValue('수정한 할 일');
      await pressComposingKey(edit, 'Escape', variant);
      await expect(edit).toBeVisible();
    }

    await edit.press('Enter');
    await expect(edit).toHaveCount(0);
    await expect(page.getByText('수정한 할 일', { exact: true })).toBeVisible();
  });

  test('Daily 새 할 일: 조합 중 Enter는 추가하지 않는다 (기존 가드 회귀)', async ({ page }) => {
    await setup(page);
    await selectPlan(page, DAILY.title);
    const input = page.getByPlaceholder('할 일을 입력하세요...');
    await input.fill('새 가상 할 일');
    for (const variant of ['isComposing', 'keyCode229'] as const) {
      await pressComposingKey(input, 'Enter', variant);
      await expect(input).toHaveValue('새 가상 할 일');
    }
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.getByText('새 가상 할 일', { exact: true })).toBeVisible();
  });

  test('AI 입력: 조합 중 Enter·Shift+Enter는 보내지 않고, 일반 Enter만 가상 AI로 보낸다', async ({ page }) => {
    const harness = await setup(page);
    await selectPlan(page, MANDALART.title);
    await page.locator('button[title="AI 어시스턴트"]').click();
    const input = page.getByPlaceholder('메시지를 입력하세요...');
    await input.fill('운동');

    for (const variant of ['isComposing', 'keyCode229'] as const) {
      await pressComposingKey(input, 'Enter', variant);
    }
    await input.press('Shift+Enter');
    await page.waitForTimeout(300);
    expect(harness.chatRequests).toHaveLength(0);
    await expect(input).toHaveValue('운동');

    await input.press('Enter');
    await expect.poll(() => harness.chatRequests.length).toBe(1);
    expect(JSON.parse(harness.chatRequests[0]).messages.at(-1).content).toBe('운동');
    await expect(page.getByText('가상 응답입니다')).toBeVisible();
    expect(harness.unexpected).toEqual([]);
  });
});

/** 이후 요청되는 JS 코드 묶음을 그대로 보내거나(pass) 실패시키거나(fail) 붙잡는다(hold). */
async function gateChunks(page: Page) {
  let mode: 'pass' | 'fail' | 'hold' = 'pass';
  const held: (() => void)[] = [];
  const gate = { blocked: 0, set: (next: typeof mode) => { mode = next; }, release: () => held.splice(0).forEach((resume) => resume()) };
  await page.route('**/_next/static/chunks/**', async (route) => {
    if (mode === 'pass') return route.continue();
    gate.blocked += 1;
    if (mode === 'fail') return route.abort('failed');
    await new Promise<void>((resume) => held.push(resume));
    return route.continue();
  });
  return gate;
}

/** 새로고침되면 사라지는 표시. 다시 시도가 페이지를 다시 읽지 않았음을 확인한다. */
const markPage = (page: Page) => page.evaluate(() => { (window as unknown as { uxNoReload: boolean }).uxNoReload = true; });
const pageKept = (page: Page) => page.evaluate(() => (window as unknown as { uxNoReload?: boolean }).uxNoReload === true);

// 최종 검토 후속: 지연 로딩 실패·대기 중에도 닫기·다시 시도가 있고, 닫은 창이 늦게 열리지 않는다.
test.describe('지연 로딩 실패·취소', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('helper: 동시 요청은 한 번만 받고, 실패 뒤 다음 요청은 다시 받으며, 성공한 코드는 유지한다', async () => {
    const Loaded = () => null;
    let calls = 0;
    let fail = true;
    const Lazy = lazyComponent<object>(() => { calls += 1; return fail ? Promise.reject(new Error('chunk')) : Promise.resolve(Loaded); });
    const first = Lazy.preload();
    expect(Lazy.preload()).toBe(first);
    await expect(first).rejects.toThrow('chunk');
    expect(calls).toBe(1);
    fail = false;
    expect(await Lazy.preload()).toBe(Loaded);
    fail = true;
    expect(await Lazy.preload()).toBe(Loaded);
    expect(calls).toBe(2);
  });

  test('사용법 코드 실패: 오류 대화상자에서 닫으면 템플릿 선택으로, 다시 시도하면 새로고침 없이 사용법이 열린다', async ({ page }) => {
    const harness = await setup(page);
    const gate = await gateChunks(page);
    await markPage(page);
    await page.locator('button[title="새로 만들기"]').nth(3).click();
    const templateDialog = page.getByRole('dialog', { name: '일간 플랜 만들기' });
    const guideHelp = templateDialog.getByRole('button', { name: '투두리스트 사용법 보기' });
    const failure = page.getByRole('dialog', { name: '사용법', exact: true });

    gate.set('fail');
    await guideHelp.click();
    await expect(failure.getByText('화면을 불러오지 못했어요.')).toBeVisible();
    expect(gate.blocked).toBeGreaterThan(0);
    await expectFocusInside(failure);
    await expectTabContained(page, failure, 'Tab');
    await page.keyboard.press('Escape');
    await expect(failure).toHaveCount(0);
    await expect(templateDialog).toBeVisible();
    await expectFocusInside(templateDialog);

    // 같은 사용법을 다시 열어도 실패 안내가 나오고, 연결이 돌아오면 다시 시도로 열린다
    await guideHelp.click();
    await expect(failure.getByRole('button', { name: '다시 시도' })).toBeVisible();
    gate.set('pass');
    await failure.getByRole('button', { name: '다시 시도' }).click();
    const guide = page.getByRole('dialog', { name: '투두리스트 사용법' });
    await expect(guide).toBeVisible();
    await expect(failure).toHaveCount(0);
    await expectFocusInside(guide);
    await page.keyboard.press('Escape');
    await expect(templateDialog).toBeVisible();
    expect(await pageKept(page)).toBe(true);
    expect(harness.unexpected).toEqual([]);
  });

  test('사용법 로딩 중 Esc: 헤더 버튼으로 초점이 돌아오고, 늦게 온 코드는 닫힌 사용법을 열지 않는다', async ({ page }) => {
    await setup(page);
    await selectPlan(page, MANDALART.title);
    const gate = await gateChunks(page);
    gate.set('hold');
    const guideButton = page.locator('header').getByRole('button', { name: '만다라트 사용법' });
    await guideButton.focus();
    await page.keyboard.press('Enter');
    const loading = page.getByRole('dialog', { name: '사용법', exact: true });
    await expect(loading.getByText('불러오는 중...')).toBeVisible();
    await expectFocusInside(loading);
    await page.keyboard.press('Escape');
    await expect(loading).toHaveCount(0);
    await expect(guideButton).toBeFocused();

    expect(gate.blocked).toBeGreaterThan(0);
    gate.set('pass');
    gate.release();
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(guideButton).toBeFocused();
    // 받은 코드는 남아 있어 다음에는 바로 열린다
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '만다라트 사용법' })).toBeVisible();
  });

  test('AI 코드 실패: 닫기·다시 열기·다시 시도로 복구, 저장 대기 중 수정은 유지되고 실제 AI는 부르지 않는다', async ({ page }) => {
    const harness = await setup(page);
    let releaseCommit!: () => void;
    const commitHeld = new Promise<void>((resolve) => { releaseCommit = resolve; });
    await page.route('**/api/v1/planner/commit', async (route) => {
      await commitHeld;
      return route.fallback();
    });
    await selectPlan(page, MANDALART.title);
    const gate = await gateChunks(page);
    await markPage(page);
    const title = page.locator('header input').first();
    await title.fill('AI 실패 중 수정');

    gate.set('fail');
    const aiButton = page.locator('button[title="AI 어시스턴트"]');
    await aiButton.click();
    const failure = page.getByRole('dialog', { name: 'AI 어시스턴트' });
    await expect(failure.getByText('화면을 불러오지 못했어요.')).toBeVisible();
    expect(gate.blocked).toBeGreaterThan(0);
    await failure.getByRole('button', { name: '닫기' }).click();
    await expect(failure).toHaveCount(0);
    await expect(aiButton).toBeFocused();

    // 한 번 연 AI는 계속 마운트되어 있으므로 다시 열면 같은 실패 안내에서 다시 시도한다
    await aiButton.click();
    gate.set('pass');
    await failure.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.getByPlaceholder('메시지를 입력하세요...')).toBeVisible();
    await expect(failure).toHaveCount(0);

    expect(await pageKept(page)).toBe(true);
    await expect(title).toHaveValue('AI 실패 중 수정');
    releaseCommit();
    await expect.poll(() => (harness.records.get(`mandalart:${MANDALART.id}`) as { data: MandalartData }).data.title).toBe('AI 실패 중 수정');
    expect(harness.chatRequests).toEqual([]);
    expect(harness.unexpected).toEqual([]);
  });

  test('AI 로딩 중 닫기: AI 버튼으로 초점이 돌아오고, 늦게 온 코드는 닫힌 패널을 열지 않는다', async ({ page }) => {
    await setup(page);
    await selectPlan(page, MANDALART.title);
    const gate = await gateChunks(page);
    gate.set('hold');
    const aiButton = page.locator('button[title="AI 어시스턴트"]');
    await aiButton.click();
    const loading = page.getByRole('dialog', { name: 'AI 어시스턴트' });
    await expect(loading.getByText('불러오는 중...')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(loading).toHaveCount(0);
    await expect(aiButton).toBeFocused();

    expect(gate.blocked).toBeGreaterThan(0);
    gate.set('pass');
    gate.release();
    await page.waitForTimeout(800);
    await expect(page.getByPlaceholder('메시지를 입력하세요...')).toHaveCount(0);
    await aiButton.click();
    await expect(page.getByPlaceholder('메시지를 입력하세요...')).toBeVisible();
  });

  test('편집 화면 코드 실패: 같은 플랜에서 다시 시도로 편집기가 열린다', async ({ page }) => {
    await setup(page);
    const gate = await gateChunks(page);
    await markPage(page);
    gate.set('fail');
    await selectPlan(page, BLOCK6.title);
    const failed = page.getByText('편집 화면을 불러오지 못했어요.', { exact: false });
    await expect(failed).toBeVisible();
    expect(gate.blocked).toBeGreaterThan(0);
    gate.set('pass');
    await page.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.getByPlaceholder('+ 새 할 일')).toBeVisible();
    await expect(failed).toHaveCount(0);
    expect(await pageKept(page)).toBe(true);
  });
});

/** UI 정보 우선순위(ui-focus) 화면 표본. UI_FOCUS_SHOT_DIR가 있을 때만 저장한다. */
const SHOT_DIR = process.env.UI_FOCUS_SHOT_DIR;
async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, animations: 'disabled' });
}

const headerMenuButton = (page: Page) => page.locator('header').getByRole('button', { name: '메뉴', exact: true });

async function openSeededMandalart(page: Page, harness: Harness, override: Partial<MandalartData> = {}) {
  if (Object.keys(override).length) {
    const key = `mandalart:${MANDALART.id}`;
    harness.records.set(key, { ...(harness.records.get(key) as object), data: { ...MANDALART, ...override } });
    await page.reload();
    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  }
  await selectPlan(page, override.title ?? MANDALART.title);
}

test.describe('헤더 정보 우선순위', () => {
  for (const width of [360, 820]) {
    test(`${width}px 만다라트: 날짜·도구·메뉴가 한 줄, 조작 크기·이름, 넘침 없음`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const harness = await setup(page);
      await openSeededMandalart(page, harness);
      await shot(page, `mandalart-${width}-header`);

      const header = page.locator('header');
      await expect(header.getByRole('textbox', { name: '플랜 제목' })).toHaveValue(MANDALART.title);
      const date = header.getByTitle('플랜 날짜 변경');
      const controls = [date, header.getByRole('button', { name: '만다라트 사용법' }), header.getByTitle('AI 어시스턴트'), headerMenuButton(page)];
      const dateBox = (await date.boundingBox())!;
      for (const control of controls) {
        await expectInViewport(page, control);
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(36);
        expect(box.width).toBeGreaterThanOrEqual(36);
        // 메뉴가 별도 줄로 떨어지지 않는다.
        expect(Math.abs((box.y + box.height / 2) - (dateBox.y + dateBox.height / 2))).toBeLessThanOrEqual(2);
      }
      const layout = await measureLayout(page);
      expect(layout.pageOverflow).toBeLessThanOrEqual(0);
      expect(layout.offscreen).toEqual([]);

      await headerMenuButton(page).click();
      await shot(page, `mandalart-${width}-menu`);
      await header.getByRole('button', { name: '초기화' }).click();
      await expect(page.getByRole('dialog', { name: '정말 초기화하시겠습니까?' })).toBeVisible();
      await shot(page, `mandalart-${width}-reset`);
    });
  }

  test('⋮ 메뉴 키보드: 열면 첫 항목, Esc·Tab으로 닫히고 초점은 메뉴 버튼, 중복 가이드 없음', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const harness = await setup(page);
    await openSeededMandalart(page, harness);
    const menuButton = headerMenuButton(page);
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await menuButton.focus();
    await page.keyboard.press('Enter');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('group', { name: '만다라트 파일·초기화' });
    await expect(page.getByRole('button', { name: 'JSON 저장', exact: true })).toBeFocused();
    await expect(menu.getByRole('button')).toHaveText(['JSON 저장', '이미지 저장', 'JSON 불러오기', '초기화…']);
    await expect(menu.getByText('파일로 내보내기')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    // Tab으로 마지막 항목을 지나면 닫힌다.
    await page.keyboard.press('Enter');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    expect(harness.commits).toBe(0);
  });

  test('초기화 확인: 첫 초점은 취소(Enter 연타로 실행 안 됨), Esc 취소 뒤 메뉴로 복귀, 확인하면 칸만 비우고 제목·날짜 유지', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const harness = await setup(page);
    await openSeededMandalart(page, harness, { year: 2024 });
    const header = page.locator('header');
    await expect(header.getByTitle('플랜 날짜 변경')).toHaveText('2024년');
    const coreCount = () => page.locator('textarea').evaluateAll((els) =>
      els.filter((el) => (el as HTMLTextAreaElement).value === '가상 핵심 목표').length);
    await expect.poll(coreCount).toBeGreaterThan(0);

    const openReset = async () => {
      await headerMenuButton(page).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: '초기화…' }).focus();
      await page.keyboard.press('Enter');
      return page.getByRole('dialog', { name: '정말 초기화하시겠습니까?' });
    };

    let dialog = await openReset();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('제목과 날짜는 그대로');
    await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
    // 키를 한 번 더 눌러도 취소된다(파괴 동작이 기본값이 아님).
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(headerMenuButton(page)).toBeFocused();

    dialog = await openReset();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(headerMenuButton(page)).toBeFocused();
    await page.waitForTimeout(1_000);
    expect(harness.commits).toBe(0);
    expect(await coreCount()).toBeGreaterThan(0);

    dialog = await openReset();
    await dialog.getByRole('button', { name: '초기화', exact: true }).click();
    await expect.poll(coreCount).toBe(0);
    await expect(header.getByRole('textbox', { name: '플랜 제목' })).toHaveValue(MANDALART.title);
    await expect(header.getByTitle('플랜 날짜 변경')).toHaveText('2024년');
    await expect.poll(() => harness.commits).toBeGreaterThan(0);
    const saved = harness.records.get(`mandalart:${MANDALART.id}`) as { data: MandalartData };
    expect(saved.data.year).toBe(2024);
    expect(saved.data.title).toBe(MANDALART.title);
    expect(saved.data.grids.every((grid) => grid.cells.every((cell) => !cell.value))).toBe(true);
  });

  test('JSON 덮어쓰기 확인: Esc는 원본 유지, 덮어쓰기는 파일 내용으로 교체', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 800 });
    const harness = await setup(page);
    await openSeededMandalart(page, harness);
    const download = page.waitForEvent('download');
    await headerMenuButton(page).click();
    await page.getByRole('button', { name: 'JSON 저장', exact: true }).click();
    const exported = JSON.parse(await fs.readFile((await (await download).path())!, 'utf8'));
    const file = Buffer.from(JSON.stringify({ ...exported, title: '파일에서 온 만다라트' }));

    const importFile = async () => {
      const chooser = page.waitForEvent('filechooser');
      await headerMenuButton(page).click();
      await page.getByRole('button', { name: 'JSON 불러오기', exact: true }).click();
      await (await chooser).setFiles({ name: 'plan.json', mimeType: 'application/json', buffer: file });
      return page.getByRole('dialog', { name: '현재 플랜을 덮어쓰시겠습니까?' });
    };

    let dialog = await importFile();
    await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(headerMenuButton(page)).toBeFocused();
    await expect(page.locator('header').getByRole('textbox', { name: '플랜 제목' })).toHaveValue(MANDALART.title);
    await page.waitForTimeout(1_000);
    expect(harness.commits).toBe(0);

    dialog = await importFile();
    await dialog.getByRole('button', { name: '덮어쓰기', exact: true }).click();
    await expect(page.locator('header').getByRole('textbox', { name: '플랜 제목' })).toHaveValue('파일에서 온 만다라트');
    await expect.poll(() => harness.commits).toBeGreaterThan(0);
  });

  test('360px Daily 헤더: 사용법 글자 유지, 날짜·도구 크기와 넘침', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await setup(page);
    await selectPlan(page, DAILY.title);
    await shot(page, 'daily-360-header');
    const header = page.locator('header');
    await expect(header.getByRole('button', { name: '투두리스트 사용법' })).toContainText('사용법');
    for (const control of [header.getByTitle('플랜 날짜 변경'), header.getByRole('button', { name: '투두리스트 사용법' })]) {
      await expectInViewport(page, control);
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    }
    await expect(headerMenuButton(page)).toHaveCount(0);
  });
});

// 성능 단계: 편집기·사용법·이모지·AI 코드는 처음 쓸 때 받는다. 지연 로딩 뒤에도 초점·저장·로그아웃 보호가 같아야 한다.
test.describe('지연 로딩된 조작', () => {
  test('만다라트: 헤더 사용법 초점 복귀, 이모지 선택 창은 도착 후 검색창 초점·선택이 DB에 저장', async ({ page }) => {
    const harness = await setup(page);
    await selectPlan(page, MANDALART.title);

    const guideButton = page.locator('header').getByRole('button', { name: '만다라트 사용법' });
    await guideButton.focus();
    await page.keyboard.press('Enter');
    const guide = page.getByRole('dialog');
    await expect(guide).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(guide).toHaveCount(0);
    await expect(guideButton).toBeFocused();

    const commitsBefore = harness.commits;
    // 데스크탑 그리드의 칸(모바일 그리드는 숨겨져 있다). 키보드로 연다.
    const emojiButton = page.locator('[title="이모지 선택"]:visible').first();
    await emojiButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByPlaceholder('이모지 검색...')).toBeFocused();
    // 이모지 그림은 외부 CDN이라 테스트에서 막혀 버튼이 보이지 않는다. 클릭 이벤트를 직접 보낸다.
    await page.locator('button.epr-emoji[data-unified]').first().dispatchEvent('click');
    await expect(page.getByPlaceholder('이모지 검색...')).toHaveCount(0);
    await expect.poll(() => harness.commits).toBeGreaterThan(commitsBefore);
    const saved = (harness.records.get(`mandalart:${MANDALART.id}`) as { data: MandalartData }).data;
    expect(saved.grids.some((grid) => grid.cells.some((cell) => !!cell.icon))).toBe(true);
    // 기존 동작: 이모지 그림은 라이브러리 기본값인 외부 CDN에서 받는다(이번 변경 범위 밖, 보고서 후속 항목).
    expect(harness.unexpected.filter((origin) => origin !== 'https://cdn.jsdelivr.net')).toEqual([]);
  });

  test('로그아웃은 지연 로딩된 동기화의 미저장 수정 ACK를 기다린다', async ({ page }) => {
    const harness = await setup(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let commitSeen = false;
    const logouts: number[] = [];
    await page.route('**/api/v1/planner/commit', async (route) => {
      commitSeen = true;
      await held;
      const { changes } = route.request().postDataJSON() as { changes: { kind: string; id: string; expectedVersion: number; data: unknown }[] };
      const saved = changes.map((change) => ({ ...change, schemaVersion: 1, version: change.expectedVersion + 1, deleted: change.data === null, updatedAt: FIXED_TIME }));
      saved.forEach((record) => harness.records.set(`${record.kind}:${record.id}`, record));
      await route.fulfill({ json: { records: saved } });
    });
    await page.route('**/api/v1/logout', (route) => { logouts.push(Date.now()); return route.fulfill({ status: 204, body: '' }); });

    await selectPlan(page, DAILY.title);
    const input = page.getByPlaceholder('할 일을 입력하세요...');
    await input.fill('로그아웃 전 할 일');
    await input.press('Enter');
    await expect.poll(() => commitSeen).toBe(true);
    // 할 일 행 조작 이름에 할 일 글자('로그아웃 전 할 일 삭제' 등)가 들어가므로 정확히 일치시킨다.
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.waitForTimeout(500);
    expect(logouts).toHaveLength(0);
    release();
    await expect.poll(() => logouts.length).toBe(1);
    const saved = (harness.records.get(`daily:${DAILY.id}`) as { data: DailyData }).data;
    expect(saved.todos.map((todo) => todo.text)).toContain('로그아웃 전 할 일');
  });
});
