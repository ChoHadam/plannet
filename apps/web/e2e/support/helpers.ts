import { expect, Page } from '@playwright/test';
import { HOST, PORTS } from './stack.config.mjs';

// 헬퍼: 플랜 생성 (카테고리 인덱스로 적합한 + 버튼 클릭)
export async function createPlan(page: Page, templateName: string, categoryIndex: number) {
  // 해당 카테고리의 + 버튼 클릭
  const createBtn = page.locator('button[title="새로 만들기"]').nth(categoryIndex);
  await createBtn.click();

  // 템플릿 선택 모달에서 클릭
  await expect(page.locator('text=템플릿을 선택하세요')).toBeVisible({ timeout: 3000 });
  await page.locator(`button:has-text("${templateName}")`).first().click();

  // DatePicker 모달 → 확인
  const dateConfirm = page.getByRole('button', { name: '확인', exact: true });
  await expect(dateConfirm).toBeVisible({ timeout: 3000 });
  await dateConfirm.click();

  // 날짜 확인이 생성의 마지막 단계다. 가이드는 선택 사항이라 생성 중에 뜨지 않는다.
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** 이전 생성 흐름(날짜 → 가이드)용. 가이드가 떠 있으면 시작하기까지 넘기고, 없으면 아무것도 하지 않는다. */
export async function dismissGuide(page: Page) {
  for (let i = 0; i < 10; i++) {
    const startBtn = page.locator('button:has-text("시작하기")');
    if (await startBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await startBtn.click();
      return;
    }

    const nextBtn = page.locator('button:has-text("다음")');
    if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await nextBtn.click();
      continue;
    }

    break;
  }
}

// ---- 모의 Spring 인증 서버 제어 (edge를 거치지 않고 직접 호출) ----

export const EDGE_ORIGIN = `http://${HOST}:${PORTS.edge}`;
const MOCK_API = `http://${HOST}:${PORTS.mockApi}`;

export interface MockUser {
  sub: string;
  email: string;
  name: string;
}

export interface MockRecord {
  kind: string;
  id: string;
  version: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

export interface MockStats {
  aiCalls: number;
  meCalls: number;
  logoutCalls: number;
  logoutRejected: number;
  sessions: number;
  plannerReads: number;
  commits: number;
}

async function mockPost(path: string, body?: unknown): Promise<void> {
  const response = await fetch(`${MOCK_API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`mock control ${path} failed: ${response.status}`);
}

export const mock = {
  reset: () => mockPost('/__mock/reset'),
  configure: (config: {
    meMode?: 'ok' | 'error' | 'slow' | 'down' | 'invalid';
    aiMode?: 'ok' | 'malformed';
    loginMode?: 'ok' | 'login_failed';
    nextUser?: MockUser;
    storageMode?: 'ok' | 'disabled' | 'error';
  }) =>
    mockPost('/__mock/config', config),
  /** 모의 DB의 해당 계정 기록과 지금까지 받은 commit requestId 목록 */
  planner: async (user: MockUser): Promise<{ userId: string; records: MockRecord[]; commitRequests: string[] }> =>
    (await fetch(`${MOCK_API}/__mock/planner?sub=${encodeURIComponent(user.sub)}`)).json(),
  /** 다른 기기가 저장한 것처럼 모의 DB를 직접 바꾼다 (버전 +1) */
  seedPlanner: (user: MockUser, documents: { kind: string; id: string; data: Record<string, unknown> | null }[]) =>
    mockPost('/__mock/planner', { sub: user.sub, documents }),
  expireSessions: () => mockPost('/__mock/expire-sessions'),
  stats: async (): Promise<MockStats> => (await fetch(`${MOCK_API}/__mock/stats`)).json(),
};

export function testUser(id: string): MockUser {
  return { sub: `sub-${id}`, email: `${id}@example.test`, name: `User ${id.toUpperCase()}` };
}

/** 로그인 버튼 → (모의) Google → callback → / 복귀까지 진행 */
export async function loginAs(page: Page, user: MockUser) {
  await mock.configure({ nextUser: user });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).first().click();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.getByText(user.name)).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
}

/** 같은 origin 브라우저 요청과 같은 헤더로 /api/chat을 부른다 (쿠키는 context가 붙인다). */
export const SAME_ORIGIN_JSON = { origin: EDGE_ORIGIN, 'content-type': 'application/json' };

export function chatBody(content = '운동') {
  return {
    messages: [
      { role: 'assistant', content: '안녕하세요! 핵심 목표가 있으신가요?' },
      { role: 'user', content },
    ],
    assistedCount: 0,
    gridState: { coreGoal: '', emptySubGoalCount: 8, existingSubGoals: [] },
  };
}

/** 로그인 전(LOCAL 범위) Daily 원본 키. 로그인 전 화면에서는 UI로 만들 수 없어 직접 심는다. */
export const LOCAL_DAILY_KEY = 'plannet-daily';

/** LOCAL 범위에 Daily 플랜 하나를 심고, 비교용 원본 문자열을 돌려준다 (페이지를 새로 불러온다). */
export async function seedLocalDaily(page: Page, title: string): Promise<string> {
  const now = '2026-09-28T00:00:00.000Z';
  const raw = JSON.stringify({
    version: 0,
    state: {
      dailyPlans: [{
        id: `seed-${title.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`, title, template: 'daily', category: 'daily',
        year: 2026, month: 9, day: 28, todos: [{ id: 'seed-todo', text: `${title} 할 일`, completed: false }],
        memo: '', createdAt: now, updatedAt: now,
      }],
      currentDailyId: null,
    },
  });
  await page.goto('/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LOCAL_DAILY_KEY, raw]);
  await page.reload();
  return raw;
}

export async function rawLocalDaily(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), LOCAL_DAILY_KEY);
}

/** 플래너(사이드바·편집기·AI 진입점)가 마운트되지 않았고, 주어진 문구가 화면에 없다 */
export async function expectPlannerClosed(page: Page, hiddenTexts: string[]) {
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.locator('button[title="새로 만들기"]')).toHaveCount(0);
  await expect(page.locator('button[title="AI 어시스턴트"]')).toHaveCount(0);
  for (const text of hiddenTexts) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
}

/** 브라우저에 남은 Plannet 키 전체 (localStorage·sessionStorage) 와 IndexedDB 이름 */
export async function browserPersistence(page: Page) {
  return page.evaluate(async () => {
    const pick = (storage: Storage) => Object.fromEntries(
      Object.keys(storage).filter((key) => key.startsWith('plannet')).sort().map((key) => [key, storage.getItem(key)]),
    );
    const databases = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((db) => db.name) : [];
    return { local: pick(localStorage), session: pick(sessionStorage), databases };
  });
}

/** 저장이 모두 확인된(깨끗한) 상태: 플래너 내용·임시 보관이 브라우저에 없다. 미리 심은 원본만 그대로 남아 있어야 한다 */
export async function expectNoPlannerPersistence(page: Page, seeded: Record<string, string> = {}) {
  expect(await browserPersistence(page)).toEqual({ local: seeded, session: {}, databases: [] });
}

export const pendingJournalKey = (userId: string) => `plannet-pending@${userId}`;

/**
 * 저장 전(미확인) 상태의 유일한 예외: sessionStorage의 이 계정 임시 보관 키 하나.
 * 바뀐 기록과 전송 중 요청만 담고 서버 기록 전체·기준 사본(base)은 담지 않는다. localStorage·IndexedDB는 그대로다.
 */
export async function expectPendingJournalOnly(page: Page, userId: string, changedIds: string[], seeded: Record<string, string> = {}) {
  const found = await browserPersistence(page);
  expect({ local: found.local, databases: found.databases }).toEqual({ local: seeded, databases: [] });
  expect(Object.keys(found.session)).toEqual([pendingJournalKey(userId)]);
  const journal = JSON.parse(found.session[pendingJournalKey(userId)]!);
  expect(Object.keys(journal).sort()).toEqual(['drafts', 'format', 'inflight', 'savedAt', 'userId']);
  expect(journal).toMatchObject({ format: 1, userId });
  const ids = new Set([...journal.drafts, ...(journal.inflight?.changes ?? [])].map((change: { id: string }) => change.id));
  expect([...ids].sort()).toEqual([...new Set(changedIds)].sort());
  return journal as { drafts: { id: string; expectedVersion: number; data: Record<string, unknown> | null }[]; inflight: { requestId: string; changes: { id: string }[] } | null };
}

/** Daily 기록 데이터 (서버 계약의 필수 필드 포함) */
export function dailyData(id: string, title: string, todo = `${title} 할 일`) {
  const now = '2026-09-28T00:00:00.000Z';
  return {
    id, title, template: 'daily', category: 'daily', year: 2026, month: 9, day: 28,
    todos: [{ id: `${id}-todo`, text: todo, completed: false }], memo: '', createdAt: now, updatedAt: now,
  };
}

/** 서버 저장 상태 표시 */
export const syncStatus = (page: Page) => page.getByTestId('storage-sync-status');
