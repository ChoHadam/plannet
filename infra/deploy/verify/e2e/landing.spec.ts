import { randomUUID } from 'node:crypto';
import { expect, Page, test } from '@playwright/test';
import { PUBLIC_ORIGIN } from './support/env';
import { currentUserId, plannerKeys, records, syncStatus } from './support/storage';
import { ACCOUNTS, login, pageFetch } from './support/ui';

/**
 * [모의 인증 검증] 로그인 랜딩 게이트와 계정 표시. 이 브라우저에 가상 로그인 전 기록(합성 fixture)을 심어 두고,
 * 확인 중·확인 실패·서버 저장 불가 상태에서 편집 화면이 열리지 않고, 로그인 뒤에도 자동으로 보이거나 가져와지지 않는지 본다.
 */

async function expectGated(page: Page, hidden: string) {
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.locator('button[title="새로 만들기"]')).toHaveCount(0);
  await expect(page.getByText(hidden, { exact: false })).toHaveCount(0);
}

function syntheticLegacy(title: string) {
  const at = '2026-09-28T00:00:00.000Z';
  return JSON.stringify({ version: 0, state: { currentDailyId: null, dailyPlans: [{
    id: `legacy-${randomUUID()}`, title, template: 'daily', category: 'daily', year: 2026, month: 9, day: 28,
    todos: [{ id: 'legacy-todo', text: `${title} 할 일`, completed: false }], memo: '', createdAt: at, updatedAt: at,
  }] } });
}

test('로그인 전 가상 기록은 랜딩·확인 중·확인 실패·저장소 불가 상태에 보이지 않고, 로그인 뒤에도 자동으로 가져오지 않는다', async ({ page }) => {
  test.setTimeout(180_000);
  const title = `로그인 전 가상 기록 ${randomUUID()}`;
  const legacy = syntheticLegacy(title);
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('plannet-daily', value), legacy);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await expectGated(page, title);

  await login(page);
  const userId = await currentUserId(page);
  await expect(page.getByText(title)).toHaveCount(0);
  expect((await records(page, userId)).some((r) => r.data?.title === title)).toBe(false);
  // 명시적 가져오기 버튼만 제공된다(누르지 않는다)
  await expect(page.getByTestId('storage-sync-import-local')).toBeVisible();

  // 인증 확인 대기: 대기 화면만
  let releaseMe!: () => void;
  const meHeld = new Promise<void>((resolve) => { releaseMe = resolve; });
  await page.route('**/api/v1/me', async (route) => { await meHeld; await route.continue(); });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('로그인 상태를 확인하고 있어요');
  await expectGated(page, title);
  releaseMe();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  await page.unroute('**/api/v1/me');

  // 인증 확인 실패: 다시 시도만
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 500, json: { error: 'synthetic' } }));
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '로그인 상태를 확인할 수 없어요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expectGated(page, title);
  await page.unroute('**/api/v1/me');

  // 첫 DB 조회 대기·실패: 편집 화면 없음
  let releaseRead!: () => void;
  const readHeld = new Promise<void>((resolve) => { releaseRead = resolve; });
  await page.route('**/api/v1/planner', async (route) => { await readHeld; await route.fulfill({ status: 503, json: { error: 'storage_unavailable' } }); });
  await page.reload();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'loading');
  await expectGated(page, title);
  releaseRead();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  await expectGated(page, title);
  await page.unroute('**/api/v1/planner');

  // 로그인했지만 서버 저장을 쓸 수 없는 응답: 계정 LocalStorage로 대체하지 않는다
  // (route.fetch는 검증 도메인 해석을 따르지 않으므로 합성 응답을 준다)
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: {
    authenticated: true, storageEnabled: false,
    user: { authProvider: 'google', externalSubject: 'synthetic-no-storage', name: ACCOUNTS.first.name, email: ACCOUNTS.first.email },
  } }));
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '계정 저장소에 연결할 수 없어요' })).toBeVisible();
  await expectGated(page, title);
  await page.unroute('**/api/v1/me');

  // 원본은 그대로, 로그인한 서비스가 localStorage에 새로 쓴 키는 없다
  expect(await page.evaluate(() => localStorage.getItem('plannet-daily'))).toBe(legacy);
  expect((await plannerKeys(page)).local).toEqual(['plannet-daily']);
});

test('계정 배지는 각 계정의 가상 이메일을 보이고(360px 포함), 로그아웃하면 게이트된 랜딩으로 돌아간다', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page);
  await expect(page.getByTestId('auth-account-email')).toHaveAttribute('title', ACCOUNTS.first.email);

  const mobile = await browser.newContext({ baseURL: PUBLIC_ORIGIN, ignoreHTTPSErrors: true, viewport: { width: 360, height: 780 } });
  try {
    const small = await mobile.newPage();
    await login(small, true);
    await expect(small.getByTestId('auth-account-email')).toBeVisible();
    await expect(small.getByTestId('auth-account-email')).toHaveText(ACCOUNTS.second.email);
    expect(await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(small.getByText(ACCOUNTS.first.email)).toHaveCount(0);
  } finally { await mobile.close(); }

  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.getByTestId('auth-account-email')).toHaveCount(0);
  expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);
  await page.reload();
  await expect(page.locator('aside')).toHaveCount(0);
});
