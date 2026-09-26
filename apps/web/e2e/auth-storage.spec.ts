import { test, expect, Page } from '@playwright/test';
import { createPlan, loginAs, logout, mock, testUser } from './support/helpers';

// 계정 전환 시 LocalStorage 격리. 서버 동기화는 범위 밖이다.

const LEGACY_DAILY_KEY = 'plannet-daily';

test.beforeEach(async () => {
  await mock.reset();
});

async function createNamedTodoPlan(page: Page, title: string) {
  await createPlan(page, '투두리스트', 3);
  const titleInput = page.locator('input[placeholder="나의 투두리스트"]');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await expect(page.locator('aside').getByText(title)).toBeVisible();
}

function sidebarPlan(page: Page, title: string) {
  return page.locator('aside').getByText(title, { exact: true });
}

test('로그인 전 데이터는 계정에 귀속되지 않고 보존되며, 계정끼리 섞이지 않는다', async ({ page }) => {
  const alice = testUser('alice');
  const bob = testUser('bob');

  // 1. 로그인 전(LOCAL 범위)에 플랜 생성
  await page.goto('/');
  await createNamedTodoPlan(page, '로그인 전 플랜');

  // 2. Alice 로그인: 기존 데이터가 보이지 않고, 보존 안내가 뜬다
  await loginAs(page, alice);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toHaveCount(0);
  await expect(page.getByText('로그인 전에 이 브라우저에 저장한 플랜은 계정과 분리해 보존했어요.', { exact: false })).toBeVisible();
  await createNamedTodoPlan(page, 'Alice 플랜');

  // 기존 키는 그대로 남아 있다 (자동 이전·삭제 없음)
  const legacy = await page.evaluate((key) => localStorage.getItem(key), LEGACY_DAILY_KEY);
  expect(legacy).toContain('로그인 전 플랜');
  expect(legacy).not.toContain('Alice 플랜');

  // 3. 로그아웃: 로그인 전 데이터가 다시 보이고 Alice 데이터는 보이지 않는다
  await logout(page);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toBeVisible();
  await expect(sidebarPlan(page, 'Alice 플랜')).toHaveCount(0);

  // 4. 같은 브라우저에서 Bob 로그인: 어느 쪽 데이터도 보이지 않는다
  await loginAs(page, bob);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toHaveCount(0);
  await expect(sidebarPlan(page, 'Alice 플랜')).toHaveCount(0);
  await createNamedTodoPlan(page, 'Bob 플랜');
  await logout(page);

  // 5. Alice 재로그인: 자기 데이터만 복원된다
  await loginAs(page, alice);
  await expect(sidebarPlan(page, 'Alice 플랜')).toBeVisible();
  await expect(sidebarPlan(page, 'Bob 플랜')).toHaveCount(0);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toHaveCount(0);
});

test('인증 상태 확인 전에는 어떤 범위에도 쓰지 않는다', async ({ page }) => {
  await loginAs(page, testUser('carol'));
  await createNamedTodoPlan(page, 'Carol 플랜');

  // me 응답을 늦춰 확인 중 상태를 만든다. 이 동안 LOCAL 범위 키가 생기면 안 된다.
  await page.route('**/api/v1/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.reload();
  await expect(page.getByText('로딩 중...')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_DAILY_KEY)).toBeNull();

  await expect(sidebarPlan(page, 'Carol 플랜')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_DAILY_KEY)).toBeNull();
});
