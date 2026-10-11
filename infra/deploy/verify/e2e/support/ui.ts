import { BrowserContext, expect, Page } from '@playwright/test';
import { MOCK_ORIGIN, PUBLIC_CALLBACK, SESSION_COOKIE } from './env';

/** local-verify 대역 OIDC(mocks/mock-external.mjs)의 가상 계정 */
export const ACCOUNTS = {
  first: { name: '검증 사용자', email: 'verify-user@example.test' },
  second: { name: '두 번째 검증 사용자', email: 'verify-second@example.test' },
} as const;

/** 로그인 버튼 → Google 대역 동의 화면 → callback → / 복귀. 계정 배지의 이름·이메일과 첫 DB 조회 완료까지 확인한다. */
export async function login(page: Page, secondAccount = false) {
  const account = secondAccount ? ACCOUNTS.second : ACCOUNTS.first;
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).first().click();
  await page.waitForURL(`${MOCK_ORIGIN}/authorize**`);
  // Spring이 계산한 callback 주소가 공개 origin 기준인지 (Google Console 등록값과 같아야 한다)
  await expect(page.getByTestId('redirect-uri')).toHaveText(PUBLIC_CALLBACK);
  await page.getByRole('button', { name: secondAccount ? '두 번째 계정으로 계속' : '테스트 계정으로 계속', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/' && !url.search.includes('authError'));
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.getByText(account.name, { exact: true })).toBeVisible();
  await expect(page.getByTestId('auth-account-email')).toHaveText(account.email);
  await expect(page.getByTestId('storage-sync-status')).toHaveAttribute('data-phase', 'saved');
}

export async function sessionCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE);
}

export interface PageFetchInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** 조건부 GET은 'no-store'로 보내 브라우저 HTTP 캐시가 304를 가로채지 않게 한다 */
  cache?: RequestCache;
}

/** 브라우저 안에서 같은 origin fetch (쿠키·Origin을 브라우저가 붙인다). 기존 호출부는 status·json·retryAfter만 쓴다. */
export async function pageFetch(page: Page, path: string, init: PageFetchInit = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        cache: init.cache,
        headers: init.body !== undefined ? { 'content-type': 'application/json', ...init.headers } : init.headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return {
        status: res.status,
        json: json as Record<string, unknown> | null,
        text,
        retryAfter: res.headers.get('retry-after'),
        etag: res.headers.get('etag'),
        cacheControl: res.headers.get('cache-control'),
      };
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
  await page.getByRole('button', { name: '만다라트 추천 9x9 그리드로 목표를 세분화', exact: true }).click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await dismissGuide(page);
  await page.locator('button[title="AI 어시스턴트"]').click();
}

/** 템플릿 첫 사용 안내를 닫는다 (안내가 없으면 그대로 둔다) */
export async function dismissGuide(page: Page) {
  for (let i = 0; i < 10; i++) {
    const start = page.locator('button:has-text("시작하기")');
    if (await start.isVisible({ timeout: 500 }).catch(() => false)) return start.click();
    const next = page.locator('button:has-text("다음")');
    if (await next.isVisible({ timeout: 500 }).catch(() => false)) await next.click();
    else return;
  }
}
