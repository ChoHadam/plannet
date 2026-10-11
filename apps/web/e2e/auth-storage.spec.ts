import { test, expect, Page } from '@playwright/test';
import {
  createPlan, expectNoPlannerPersistence, expectPlannerClosed, LOCAL_DAILY_KEY, loginAs, logout, mock, MockUser, rawLocalDaily,
  seedLocalDaily, syncStatus, testUser,
} from './support/helpers';

// 로그인한 서비스 모드: 계정 기록은 (모의) DB에만 저장되고 브라우저 저장소에는 남지 않는다. 계정끼리 섞이지 않는다.

test.beforeEach(async () => {
  await mock.reset();
});

async function createNamedTodoPlan(page: Page, title: string) {
  await createPlan(page, '투두리스트', 3);
  const titleInput = page.locator('input[placeholder="나의 투두리스트"]');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await expect(page.locator('aside').getByText(title)).toBeVisible();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
}

function sidebarPlan(page: Page, title: string) {
  return page.locator('aside').getByText(title, { exact: true });
}

async function dbTitles(user: MockUser) {
  return (await mock.planner(user)).records.map((record) => record.data?.title);
}

test('로그인 전 원본은 그대로 보존되고, 계정 기록은 DB에만 저장되며 계정끼리 섞이지 않는다', async ({ page }) => {
  const alice = testUser('alice');
  const bob = testUser('bob');

  // 1. 로그인 전(LOCAL 범위) 원본: 랜딩에서는 플래너 자체가 없다
  const source = await seedLocalDaily(page, '로그인 전 플랜');
  const seeded = { [LOCAL_DAILY_KEY]: source };
  await expectPlannerClosed(page, ['로그인 전 플랜']);

  // 2. Alice 로그인: 원본은 자동 귀속되지 않고, 새 기록은 DB에만 저장된다
  await loginAs(page, alice);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toHaveCount(0);
  await createNamedTodoPlan(page, 'Alice 플랜');
  expect(await dbTitles(alice)).toContain('Alice 플랜');
  await expectNoPlannerPersistence(page, seeded);

  // 3. 로그아웃: 랜딩으로 돌아가며 원본도 Alice 기록도 보이지 않는다
  await logout(page);
  await expectPlannerClosed(page, ['로그인 전 플랜', 'Alice 플랜']);
  await expectNoPlannerPersistence(page, seeded);

  // 4. 같은 브라우저에서 Bob 로그인: 어느 쪽 데이터도 보이지 않는다
  await loginAs(page, bob);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toHaveCount(0);
  await expect(sidebarPlan(page, 'Alice 플랜')).toHaveCount(0);
  await createNamedTodoPlan(page, 'Bob 플랜');
  await logout(page);
  expect(await dbTitles(bob)).toEqual(['Bob 플랜']);

  // 5. Alice 재로그인: DB에서 자기 데이터만 불러온다
  await loginAs(page, alice);
  await expect(sidebarPlan(page, 'Alice 플랜')).toBeVisible();
  await expect(sidebarPlan(page, 'Bob 플랜')).toHaveCount(0);
  await expect(sidebarPlan(page, '로그인 전 플랜')).toHaveCount(0);
  expect(await rawLocalDaily(page)).toBe(source);
  await expectNoPlannerPersistence(page, seeded);
});

test('인증 상태 확인 전에는 플래너를 열지 않고 어떤 범위에도 쓰지 않는다', async ({ page }) => {
  await loginAs(page, testUser('carol'));
  await createNamedTodoPlan(page, 'Carol 플랜');

  // me 응답을 늦춰 확인 중 상태를 만든다. 이 동안 플래너가 없고 브라우저에 아무 키도 생기면 안 된다.
  await page.route('**/api/v1/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('로그인 상태를 확인하고 있어요');
  await expectPlannerClosed(page, ['Carol 플랜']);
  await expectNoPlannerPersistence(page);

  await expect(sidebarPlan(page, 'Carol 플랜')).toBeVisible();
  await expectNoPlannerPersistence(page);
});

test('서버 저장이 없는 로그인 상태는 계정 LocalStorage로 대체하지 않고 다시 시도·로그아웃만 보인다', async ({ page }) => {
  await mock.configure({ storageMode: 'disabled' });
  await loginAs(page, testUser('nostore'));
  await expect(page.getByRole('status')).toContainText('계정 저장소에 연결할 수 없어요');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expectPlannerClosed(page, []);
  await expectNoPlannerPersistence(page);

  await mock.configure({ storageMode: 'ok' });
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.locator('aside')).toBeVisible();
  await logout(page);
});
