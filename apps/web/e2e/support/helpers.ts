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

  // 가이드 모달 → "시작하기" 찾을 때까지 "다음" 클릭
  await dismissGuide(page);
}

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

export interface MockStats {
  aiCalls: number;
  meCalls: number;
  logoutCalls: number;
  logoutRejected: number;
  sessions: number;
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
  }) =>
    mockPost('/__mock/config', config),
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
