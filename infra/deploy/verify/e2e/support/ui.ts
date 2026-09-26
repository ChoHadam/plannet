import { BrowserContext, expect, Page } from '@playwright/test';
import { MOCK_ORIGIN, PUBLIC_CALLBACK, SESSION_COOKIE } from './env';

/** 로그인 버튼 → Google 대역 동의 화면 → callback → / 복귀 */
export async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).first().click();
  await page.waitForURL(`${MOCK_ORIGIN}/authorize**`);
  // Spring이 계산한 callback 주소가 공개 origin 기준인지 (Google Console 등록값과 같아야 한다)
  await expect(page.getByTestId('redirect-uri')).toHaveText(PUBLIC_CALLBACK);
  await page.getByRole('button', { name: '테스트 계정으로 계속' }).click();
  await page.waitForURL((url) => url.pathname === '/' && !url.search.includes('authError'));
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.getByText('검증 사용자')).toBeVisible();
}

export async function sessionCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE);
}

/** 브라우저 안에서 같은 origin fetch (쿠키·Origin을 브라우저가 붙인다) */
export async function pageFetch(page: Page, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        headers: init.body !== undefined ? { 'content-type': 'application/json', ...init.headers } : init.headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: res.status, json: json as Record<string, unknown> | null, retryAfter: res.headers.get('retry-after') };
    },
    { path, init },
  );
}

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

/** 만다라트 플랜을 만들고 AI 어시스턴트를 연다 (apps/web/e2e/support/helpers.ts 와 같은 UI 흐름) */
export async function openMandalartAssistant(page: Page) {
  await page.locator('button[title="새로 만들기"]').nth(0).click();
  await expect(page.locator('text=템플릿을 선택하세요')).toBeVisible();
  await page.locator('button:has-text("만다라트")').first().click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  for (let i = 0; i < 10; i++) {
    const start = page.locator('button:has-text("시작하기")');
    if (await start.isVisible({ timeout: 500 }).catch(() => false)) {
      await start.click();
      break;
    }
    const next = page.locator('button:has-text("다음")');
    if (await next.isVisible({ timeout: 500 }).catch(() => false)) await next.click();
    else break;
  }
  await page.locator('button[title="AI 어시스턴트"]').click();
}
