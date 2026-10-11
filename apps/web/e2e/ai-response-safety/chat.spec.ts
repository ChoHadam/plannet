import { test, expect, Page, Route } from '@playwright/test';
import { MandalartData } from '../../src/types/mandalart';
import {
  ACCOUNT_A,
  ACCOUNT_B,
  accountUserId,
  buildPlan,
  FIXED_TIME,
  TestAccount,
} from './fixtures';

/**
 * 지연 AI 응답 보호 (AIChatSidebar + lib/aiResponseSafety.ts).
 *
 * - 인증·AI·서버 저장은 브라우저에서 가로챈 모의 응답이다. /api/chat 요청은 붙잡아 두었다가 테스트가 원하는 시점에 돌려준다.
 * - 로그인한 서비스 모드라 기록은 모의 DB(계정별 Map)에만 저장된다. readPlan은 탭에 미저장 수정이 없을 때 DB를 읽는다.
 * - 채팅 패널은 화면 전체를 덮는 오버레이라 마우스로는 뒤의 그리드·사이드바를 누를 수 없다.
 *   패널이 열린 채로 일어나는 편집·전환은 키보드 사용자의 경로(focus + 키 입력)로 재현한다.
 */

const ACTIONS = ['아침 스트레칭', '주3회 헬스', '만보 걷기', '계단 이용', '수영 강습', '요가', '자전거', '홈트'];
const CHAT_INPUT = '메시지를 입력하세요...';

interface ChatBody {
  message: string;
  action: string;
  data: Record<string, unknown>;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUSD: string };
}

function generateActionsReply(subGoal: string, message = `'${subGoal}'의 실천 계획을 만들었어요!`): ChatBody {
  return {
    message,
    action: 'generate_actions',
    data: { subGoal, actions: ACTIONS },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUSD: '0.000100' },
  };
}

/** 붙잡아 둔 /api/chat 요청 */
class HeldChat {
  private readonly held: Route[] = [];
  private waiters: ((route: Route) => void)[] = [];
  readonly outcomes: string[] = [];

  push(route: Route) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(route);
    else this.held.push(route);
  }

  next(): Promise<Route> {
    const route = this.held.shift();
    if (route) return Promise.resolve(route);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** 브라우저가 이미 요청을 취소했으면 fulfill이 실패한다. 결과만 기록한다. */
  async release(route: Route, body: unknown, status = 200) {
    try {
      await route.fulfill({ status, json: body });
      this.outcomes.push('delivered');
    } catch {
      this.outcomes.push('aborted');
    }
  }
}

interface StoredRecord { kind: string; id: string; schemaVersion: 1; version: number; deleted: boolean; data: Record<string, unknown> | null; updatedAt: string }

interface Harness {
  chat: HeldChat;
  setAccount: (account: TestAccount | null) => void;
  /** 모의 DB에 계정의 플랜을 심는다 (다른 기기에서 저장한 것처럼) */
  seed: (account: TestAccount, plans: MandalartData[]) => void;
  /** 받은 commit 본문 */
  commits: string[];
}

/** 계정별 모의 DB. 페이지 수명과 무관하게 테스트 동안 유지된다. */
const databases = new WeakMap<Page, Map<string, Map<string, StoredRecord>>>();

function database(page: Page, account: TestAccount) {
  if (!databases.has(page)) databases.set(page, new Map());
  const all = databases.get(page)!;
  if (!all.has(account.subject)) all.set(account.subject, new Map());
  return all.get(account.subject)!;
}

async function setup(page: Page, account: TestAccount, plans: MandalartData[], currentId: string): Promise<Harness> {
  let current: TestAccount | null = account;
  const chat = new HeldChat();
  const commits: string[] = [];
  const seed = (target: TestAccount, list: MandalartData[]) => {
    const db = database(page, target);
    for (const plan of list) {
      db.set(`mandalart:${plan.id}`, {
        kind: 'mandalart', id: plan.id, schemaVersion: 1, version: 1, deleted: false,
        data: plan as unknown as Record<string, unknown>, updatedAt: FIXED_TIME,
      });
    }
  };
  seed(account, plans);

  await page.route('**/api/runtime-config', (route) => route.fulfill({ json: { authEnabled: true, backupEnabled: false } }));
  await page.route('**/api/v1/me', (route) =>
    current
      ? route.fulfill({
          json: {
            authenticated: true, storageEnabled: true,
            user: { authProvider: 'google', externalSubject: current.subject, name: current.name, userId: accountUserId(current) },
          },
        })
      : route.fulfill({ status: 401, json: { authenticated: false } }),
  );
  await page.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-AIRS-CSRF', token: 'airs-test-token' } }));
  await page.route('**/api/v1/planner', (route) => {
    if (!current) return route.fulfill({ status: 401, json: { authenticated: false } });
    if (route.request().headers()['x-plannet-user-id'] !== accountUserId(current)) return route.fulfill({ status: 409, json: { error: 'account_changed' } });
    return route.fulfill({ json: { userId: accountUserId(current), records: [...database(page, current).values()] } });
  });
  await page.route('**/api/v1/planner/commit', (route) => {
    const body = route.request().postData() ?? '';
    commits.push(body);
    if (!current) return route.fulfill({ status: 401, json: { authenticated: false } });
    if (route.request().headers()['x-plannet-user-id'] !== accountUserId(current)) return route.fulfill({ status: 409, json: { error: 'account_changed' } });
    const db = database(page, current);
    const { changes } = JSON.parse(body) as { changes: { kind: string; id: string; expectedVersion: number; data: Record<string, unknown> | null }[] };
    if (changes.some((change) => (db.get(`${change.kind}:${change.id}`)?.version ?? 0) !== change.expectedVersion)) {
      return route.fulfill({ status: 409, json: { error: 'version_conflict', conflicts: [] } });
    }
    const records = changes.map((change): StoredRecord => ({
      kind: change.kind, id: change.id, schemaVersion: 1, version: change.expectedVersion + 1,
      deleted: change.data === null, data: change.data, updatedAt: FIXED_TIME,
    }));
    records.forEach((record) => db.set(`${record.kind}:${record.id}`, record));
    return route.fulfill({ json: { records } });
  });
  await page.route('**/api/v1/logout', (route) => {
    current = null;
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/chat', (route) => chat.push(route));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  // 선택 상태는 저장하지 않는다(서버 기록만 불러온다). 테스트 대상 플랜을 연다.
  await openPlan(page, plans.find((plan) => plan.id === currentId)!.title);
  // 모바일: 선택하면 사이드바가 닫힌다. 혹시 열려 있으면 배경을 눌러 닫는다.
  const backdrop = page.locator('div.fixed.inset-0.z-30.md\\:hidden');
  if (await backdrop.isVisible()) {
    const width = page.viewportSize()!.width;
    await backdrop.click({ position: { x: width - 5, y: 5 } });
    await expect(backdrop).toHaveCount(0);
  }
  return { chat, setAccount: (next) => (current = next), seed, commits };
}

async function openPlan(page: Page, title: string) {
  await selectPlanByKeyboard(page, title);
  await expect(page.locator('input[placeholder="나의 만다라트"]')).toHaveValue(title);
}

/** 탭에 저장 전 수정이 없어질 때까지 기다린 뒤 모의 DB의 기록을 읽는다 (삭제면 undefined) */
async function readPlan(page: Page, account: TestAccount, id: string): Promise<MandalartData | undefined> {
  const status = page.getByTestId('storage-sync-status');
  if (await status.count()) await expect(status).toHaveAttribute('data-dirty', 'false');
  const record = database(page, account).get(`mandalart:${id}`);
  return record && !record.deleted ? (record.data as unknown as MandalartData) : undefined;
}

function cellValue(plan: MandalartData | undefined, gridId: string, index: number): string | undefined {
  return plan?.grids.find((grid) => grid.id === gridId)?.cells[index]?.value;
}

async function openChat(page: Page) {
  await page.locator('button[title="AI 어시스턴트"]').click();
  await expect(page.getByPlaceholder(CHAT_INPUT)).toBeVisible();
}

async function sendChat(page: Page, text: string) {
  const input = page.getByPlaceholder(CHAT_INPUT);
  await input.fill(text);
  await input.press('Enter');
}

function chatPanel(page: Page) {
  return page.locator('div.fixed.inset-0.z-50.flex.justify-end');
}

async function closeChat(page: Page) {
  await chatPanel(page).locator('h2:has-text("AI 어시스턴트")').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]').getByRole('button').click();
  await expect(page.getByPlaceholder(CHAT_INPUT)).toHaveCount(0);
}

const loadingDots = (page: Page) => chatPanel(page).locator('.animate-bounce');

/** 사이드바의 플랜 선택 버튼 (메뉴 버튼 제외) */
function planButton(page: Page, title: string) {
  return page.locator('aside').getByRole('button', { name: title }).filter({ hasText: title }).first();
}

/** 사이드바 플랜을 키보드로 연다. 모바일에서 접힌 사이드바는 inert라 열기 버튼을 먼저 누른다. */
async function selectPlanByKeyboard(page: Page, title: string) {
  // 로그아웃 배지는 DB 조회 중 화면에도 보이므로, 사이드바가 붙은 뒤에 접힘 여부를 본다.
  await page.locator('aside').waitFor({ state: 'attached' });
  const openSidebar = page.locator('button[title="사이드바 열기"]');
  if (await openSidebar.isVisible()) await pressByKeyboard(page, openSidebar);
  await pressByKeyboard(page, planButton(page, title));
}

/** 오버레이 뒤의 버튼을 키보드로 누른다 */
async function pressByKeyboard(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.focus();
  await page.keyboard.press('Enter');
}

async function resetCurrentPlan(page: Page) {
  await pressByKeyboard(page, page.locator('header button[title="메뉴"]'));
  await pressByKeyboard(page, page.locator('header').getByRole('button', { name: '초기화' }));
  await pressByKeyboard(page, page.locator('h3:has-text("정말 초기화하시겠습니까?")').locator('xpath=..').getByRole('button', { name: '초기화' }));
}

/** Transport may finish after cancellation. Exercise the guard even when abort cannot stop delivery. */
async function allowLateChatResponses(page: Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input !== '/api/chat') return originalFetch(input, init);
      const response = await originalFetch(input, { ...init, signal: undefined });
      const readJson = response.json.bind(response);
      response.json = async () => {
        const body: unknown = await readJson();
        const root = document.documentElement;
        root.dataset.airsChatDelivered = String(Number(root.dataset.airsChatDelivered || 0) + 1);
        return body;
      };
      return response;
    };
  });
}

async function expectDeliveredResponses(page: Page, count: number) {
  await expect(page.locator('html')).toHaveAttribute('data-airs-chat-delivered', String(count));
}

const PLAN_A = () => buildPlan('airs-plan-a', 'AIRS 플랜 A', { center: { 4: '건강' } });
const PLAN_B = () => buildPlan('airs-plan-b', 'AIRS 플랜 B', { center: { 4: '커리어' } });

for (const action of ['set_core_goal', 'generate_actions'] as const) {
  test(`빈 핵심 목표를 초기화하면 같은 ID·시각·셀 값이어도 이전 ${action} 응답 전체를 버린다`, async ({ page }) => {
    await allowLateChatResponses(page);
    await page.clock.setFixedTime(new Date(FIXED_TIME));
    const blank = buildPlan('airs-plan-a', 'AIRS 플랜 A', {});
    const { chat } = await setup(page, ACCOUNT_A, [blank], blank.id);
    await openChat(page);
    await sendChat(page, '초기화 이전 질문');
    const stale = await chat.next();

    await resetCurrentPlan(page);
    // Before/after timestamps and cell values are deliberately equal.
    const reset = await readPlan(page, ACCOUNT_A, blank.id);
    expect(reset?.createdAt).toBe(blank.createdAt);
    expect(reset?.updatedAt).toBe(blank.updatedAt);
    await chat.release(stale, {
      ...generateActionsReply('이전 하위 목표', '초기화 이전 응답'),
      action,
      data: { coreGoal: '초기화 이전 핵심 목표', subGoal: '이전 하위 목표', actions: ACTIONS },
    });
    await expectDeliveredResponses(page, 1);

    const plan = await readPlan(page, ACCOUNT_A, blank.id);
    expect(plan?.grids.every((grid) => grid.cells.every((cell) => cell.value === ''))).toBe(true);
    await expect(chatPanel(page).getByText('초기화 이전 응답')).toHaveCount(0);
    await expect(chatPanel(page).getByText('초기화 이전 질문', { exact: true })).toHaveCount(0);
    await expect(chatPanel(page).getByText('토큰:', { exact: false })).toHaveCount(0);
    await expect(loadingDots(page)).toHaveCount(0);
    await expect(page.getByPlaceholder(CHAT_INPUT)).toBeEnabled();
    // The cancellation token is transient: it never reaches the DB record, and nothing is written to browser storage.
    expect(Object.keys(plan ?? {})).not.toContain('resetToken');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('plannet')))).toEqual([]);
  });
}

test('초기화 후 새 요청 중 늦은 이전 응답은 메시지·횟수·사용량·loading을 바꾸지 않는다', async ({ page }) => {
  await allowLateChatResponses(page);
  const blank = buildPlan('airs-plan-a', 'AIRS 플랜 A', {});
  const { chat } = await setup(page, ACCOUNT_A, [blank], blank.id);
  await openChat(page);
  await sendChat(page, '기존 도움');
  await chat.release(await chat.next(), generateActionsReply('기존 도움'));
  await expect(chatPanel(page).getByText('토큰: 150')).toBeVisible();
  await sendChat(page, '이전 마지막 도움');
  const stale = await chat.next();
  expect(stale.request().postDataJSON().assistedCount).toBe(1);

  await resetCurrentPlan(page);
  await expect(page.getByPlaceholder(CHAT_INPUT)).toBeEnabled();
  await expect(chatPanel(page).getByText('토큰:', { exact: false })).toHaveCount(0);
  await sendChat(page, '새 도움');
  const fresh = await chat.next();
  expect(fresh.request().postDataJSON().assistedCount).toBe(0);

  await chat.release(stale, generateActionsReply('이전 마지막 도움', '이전 종료 응답'));
  await expectDeliveredResponses(page, 2);
  await expect(loadingDots(page).first()).toBeVisible();
  await expect(page.getByPlaceholder(CHAT_INPUT)).toBeDisabled();
  await expect(chatPanel(page).getByText('이전 종료 응답')).toHaveCount(0);
  await expect(chatPanel(page).getByText('대화가 종료되었습니다')).toHaveCount(0);
  await expect(chatPanel(page).getByText('토큰:', { exact: false })).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, blank.id), 'center', 0)).toBe('');

  await chat.release(fresh, generateActionsReply('새 도움'));
  await expect(chatPanel(page).getByText('토큰: 150')).toBeVisible();
  await expect(loadingDots(page)).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, blank.id), 'center', 0)).toBe('새 도움');
  await sendChat(page, '새 두 번째 도움');
  const second = await chat.next();
  expect(second.request().postDataJSON().assistedCount).toBe(1);
  await chat.release(second, generateActionsReply('새 두 번째 도움'));
  await expect(chatPanel(page).getByText('토큰: 300')).toBeVisible();
  await expect(chatPanel(page).getByText('대화가 종료되었습니다')).toBeVisible();
});

test('정상 요청은 기존처럼 그리드를 채우고 메시지·사용량을 갱신한다 @mobile', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A(), PLAN_B()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const route = await chat.next();
  await expect(loadingDots(page).first()).toBeVisible();

  await chat.release(route, generateActionsReply('운동'));
  await expect(chatPanel(page).getByText("'운동'의 실천 계획을 만들었어요!")).toBeVisible();
  await expect(chatPanel(page).getByText('토큰: 150')).toBeVisible();
  await expect(loadingDots(page)).toHaveCount(0);

  const plan = await readPlan(page, ACCOUNT_A, 'airs-plan-a');
  expect(cellValue(plan, 'center', 0)).toBe('운동');
  expect(cellValue(plan, 'top-left', 4)).toBe('운동');
  expect(cellValue(plan, 'top-left', 0)).toBe(ACTIONS[0]);
  expect(cellValue(plan, 'top-left', 8)).toBe(ACTIONS[7]);
});

test('현재 요청의 401·429·503 안내는 그대로 보인다', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);

  await sendChat(page, '운동');
  await chat.release(await chat.next(), { ok: false, error: 'rate_limited', message: 'AI 요청 한도를 넘었어요. 잠시 후 다시 시도해주세요.' }, 429);
  await expect(chatPanel(page).getByText('AI 요청 한도를 넘었어요.', { exact: false })).toBeVisible();

  await sendChat(page, '운동');
  await chat.release(await chat.next(), { ok: false, error: 'auth_unavailable', message: '로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요.' }, 503);
  await expect(chatPanel(page).getByText('로그인 상태를 확인할 수 없어요.', { exact: false })).toBeVisible();

  await sendChat(page, '운동');
  await chat.release(await chat.next(), { ok: false, error: 'unauthenticated', message: '로그인이 필요해요.' }, 401);
  await expect(chatPanel(page).getByText('로그인이 필요해요.')).toBeVisible();
  await expect(chatPanel(page).getByText('AI 어시스턴트는 로그인 후 사용할 수 있어요.')).toBeVisible();
});

test('요청 중 다른 플랜으로 전환하면 이전 응답은 두 플랜과 새 채팅에 영향이 없고, 새 요청은 성공한다', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A(), PLAN_B()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const stale = await chat.next();

  // 패널을 연 채로 키보드로 플랜 B 선택
  await selectPlanByKeyboard(page, 'AIRS 플랜 B');
  await expect(chatPanel(page).getByText("'커리어' 목표가 이미 설정되어 있네요!", { exact: false })).toBeVisible();
  await expect(loadingDots(page)).toHaveCount(0);

  await chat.release(stale, generateActionsReply('운동', '이전 응답 메시지'));
  await page.waitForTimeout(300);
  await expect(chatPanel(page).getByText('이전 응답 메시지')).toHaveCount(0);
  await expect(chatPanel(page).getByText('토큰:', { exact: false })).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('');
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-b'), 'center', 0)).toBe('');

  // 플랜 B에서 새 요청은 정상 적용
  await sendChat(page, '영어');
  await chat.release(await chat.next(), generateActionsReply('영어'));
  await expect(chatPanel(page).getByText("'영어'의 실천 계획을 만들었어요!")).toBeVisible();
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-b'), 'center', 0)).toBe('영어');
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('');
});

test('A→B→A로 다시 선택해도 이전 요청의 응답은 적용되지 않는다 @mobile', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A(), PLAN_B()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const stale = await chat.next();

  // 모바일은 접힌 사이드바가 초점을 받지 않으므로 열기 버튼을 먼저 누른다 (selectPlanByKeyboard)
  await selectPlanByKeyboard(page, 'AIRS 플랜 B');
  await expect(chatPanel(page).getByText("'커리어' 목표가", { exact: false })).toBeVisible();
  await selectPlanByKeyboard(page, 'AIRS 플랜 A');
  await expect(chatPanel(page).getByText("'건강' 목표가", { exact: false })).toBeVisible();
  await expect(chatPanel(page).getByText('운동', { exact: true })).toHaveCount(0);

  await chat.release(stale, generateActionsReply('운동', '이전 응답 메시지'));
  await page.waitForTimeout(300);
  await expect(chatPanel(page).getByText('이전 응답 메시지')).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('');

  await sendChat(page, '독서');
  await chat.release(await chat.next(), generateActionsReply('독서'));
  await expect(chatPanel(page).getByText("'독서'의 실천 계획을 만들었어요!")).toBeVisible();
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('독서');
});

test('요청 중 현재 플랜을 삭제하면 이전 응답은 남은 플랜에 적용되지 않는다', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A(), PLAN_B()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const stale = await chat.next();

  await pressByKeyboard(page, page.locator('aside').getByRole('button', { name: 'AIRS 플랜 A 메뉴' }));
  await pressByKeyboard(page, page.locator('aside').getByRole('button', { name: '삭제', exact: true }));
  await pressByKeyboard(page, page.locator('h3:has-text("플랜을 삭제하시겠습니까?")').locator('xpath=..').getByRole('button', { name: '삭제', exact: true }));
  await expect.poll(async () => readPlan(page, ACCOUNT_A, 'airs-plan-a')).toBeUndefined();

  await chat.release(stale, generateActionsReply('운동', '이전 응답 메시지'));
  await page.waitForTimeout(300);
  await expect(page.getByText('이전 응답 메시지')).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-b'), 'center', 0)).toBe('');
});

test('응답을 기다리는 동안 직접 입력한 하위 목표를 덮어쓰지 않는다', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const route = await chat.next();

  // 키보드로 중앙 그리드 첫 하위 목표 칸에 입력 (요청 시점에는 비어 있던 칸)
  // 외곽 그리드는 하위 목표가 없으면 비활성이므로, 보이는 그리드에서 활성화된 첫 '하위 목표' 칸이 중앙 그리드의 0번 칸이다
  // (같은 id의 숨은 그리드가 함께 렌더링되므로 :visible로 좁힌다)
  const firstSubGoal = page.locator('#mandalart-grid textarea[placeholder="하위 목표"]:not([disabled]):visible').first();
  await firstSubGoal.focus();
  await page.keyboard.type('내가 쓴 목표');
  await expect.poll(async () => cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('내가 쓴 목표');

  await chat.release(route, generateActionsReply('운동'));
  await expect(chatPanel(page).getByText("'운동'의 실천 계획을 만들었어요!")).toBeVisible();

  const plan = await readPlan(page, ACCOUNT_A, 'airs-plan-a');
  expect(cellValue(plan, 'center', 0)).toBe('내가 쓴 목표');
  expect(cellValue(plan, 'top-left', 4)).toBe('내가 쓴 목표');
  expect(cellValue(plan, 'top-left', 0)).toBe('');
  // AI 결과는 요청 시점에도 지금도 빈 다음 칸에 들어간다
  expect(cellValue(plan, 'center', 1)).toBe('운동');
  expect(cellValue(plan, 'top', 0)).toBe(ACTIONS[0]);
});

test('응답을 기다리는 동안 플랜을 초기화하면 이전 응답을 그리드에 쓰지 않는다', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const route = await chat.next();

  await resetCurrentPlan(page);
  await expect.poll(async () => cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 4)).toBe('');

  await chat.release(route, generateActionsReply('운동'));
  await expect(page.getByPlaceholder(CHAT_INPUT)).toBeEnabled();
  await expect(chatPanel(page).getByText("'운동'의 실천 계획을 만들었어요!", { exact: false })).toHaveCount(0);
  await expect(chatPanel(page).getByText('토큰:', { exact: false })).toHaveCount(0);
  const plan = await readPlan(page, ACCOUNT_A, 'airs-plan-a');
  expect(plan?.grids.every((grid) => grid.cells.every((cell) => cell.value === ''))).toBe(true);
});

test('닫으면 요청이 취소되고, 다시 열어 보낸 새 요청은 이전 요청의 완료에 영향받지 않는다 @mobile', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const stale = await chat.next();

  await closeChat(page);
  await openChat(page);
  // 답을 받지 못한 질문은 입력창으로 돌아온다
  await expect(page.getByPlaceholder(CHAT_INPUT)).toHaveValue('운동');
  await expect(loadingDots(page)).toHaveCount(0);

  await sendChat(page, '독서');
  const fresh = await chat.next();
  await expect(loadingDots(page).first()).toBeVisible();

  // 이전 요청이 뒤늦게 끝나도 새 요청의 loading·메시지·그리드는 그대로
  await chat.release(stale, generateActionsReply('운동', '이전 응답 메시지'));
  await page.waitForTimeout(300);
  await expect(loadingDots(page).first()).toBeVisible();
  await expect(chatPanel(page).getByText('이전 응답 메시지')).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('');

  await chat.release(fresh, generateActionsReply('독서'));
  await expect(chatPanel(page).getByText("'독서'의 실천 계획을 만들었어요!")).toBeVisible();
  await expect(loadingDots(page)).toHaveCount(0);
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('독서');
});

test('두 번째 도움으로 끝난 대화를 새로 시작한 뒤에는 진행 횟수·사용량이 처음부터 다시 센다', async ({ page }) => {
  const { chat } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  await chat.release(await chat.next(), generateActionsReply('운동'));
  await sendChat(page, '독서');
  await chat.release(await chat.next(), generateActionsReply('독서'));
  await expect(chatPanel(page).getByText('대화가 종료되었습니다')).toBeVisible();

  await chatPanel(page).getByRole('button', { name: '새로운 대화 시작' }).click();
  await expect(chatPanel(page).getByText('토큰:', { exact: false })).toHaveCount(0);
  await sendChat(page, '저축');
  const route = await chat.next();
  expect(route.request().postDataJSON().assistedCount).toBe(0);
  await chat.release(route, generateActionsReply('저축'));
  await expect(chatPanel(page).getByText('토큰: 150')).toBeVisible();
});

test('요청 중 로그아웃하면 페이지 이동 전 도착한 응답도 이전 계정 기록을 바꾸지 않는다', async ({ page }) => {
  const { chat, commits } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const stale = await chat.next();

  // 이전 페이지가 A 계정 기록에 응답을 반영해 저장하려 하면 commit 본문에 표식이 나타난다.

  // 로그아웃 후 '/'로 이동하는 문서 요청을 붙잡아, 이전 페이지가 살아 있는 동안 응답을 돌려준다.
  let releaseNavigation: () => void = () => {};
  const navigationHeld = new Promise<void>((resolve) => {
    void page.route(
      (url) => url.pathname === '/',
      async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        resolve();
        await new Promise<void>((done) => (releaseNavigation = done));
        await route.fallback();
      },
      { times: 1 },
    );
  });

  await pressByKeyboard(page, page.getByRole('button', { name: '로그아웃' }));
  await navigationHeld;
  await chat.release(stale, generateActionsReply('실천 계획 표식'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  releaseNavigation();

  await expect(page.getByRole('button', { name: 'Google 로그인' }).first()).toBeVisible();
  expect(commits.filter((body) => body.includes('실천 계획 표식'))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('plannet')))).toEqual([]);
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('');
});

test('다른 계정으로 전환된 뒤에는 새 계정 범위에서만 요청·적용된다', async ({ page }) => {
  const { chat, setAccount, seed } = await setup(page, ACCOUNT_A, [PLAN_A()], 'airs-plan-a');
  await openChat(page);
  await sendChat(page, '운동');
  const stale = await chat.next();

  // 모의 인증에서 B로 바꾸고 새로 불러오면(로그인 전환과 같은 경로) 이전 페이지의 요청은 사라진다
  setAccount(ACCOUNT_B);
  seed(ACCOUNT_B, [PLAN_B()]);
  await page.reload();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await chat.release(stale, generateActionsReply('운동'));
  await openPlan(page, 'AIRS 플랜 B');

  await openChat(page);
  await sendChat(page, '영어');
  await chat.release(await chat.next(), generateActionsReply('영어'));
  await expect(chatPanel(page).getByText("'영어'의 실천 계획을 만들었어요!")).toBeVisible();
  expect(cellValue(await readPlan(page, ACCOUNT_B, 'airs-plan-b'), 'center', 0)).toBe('영어');
  expect(cellValue(await readPlan(page, ACCOUNT_A, 'airs-plan-a'), 'center', 0)).toBe('');
});
