import { test, expect, Page } from '@playwright/test';
import { createPlan } from '../support/helpers';
import {
  DAILY_STORAGE_KEY,
  dailyPlans,
  libraryDialog,
  loginAs,
  logout,
  mock,
  openLibrary,
  seedDaily,
  testUser,
} from './helpers';

// 계정 저장 범위가 바뀌면 전체 목록도 그 계정의 플랜만 보여준다.

test.beforeEach(async () => {
  await mock.reset();
});

/** 로그인한 계정 범위의 Daily 키를 찾는다 (UI로 한 번 저장해 키를 만든 뒤 조회). */
async function accountDailyKey(page: Page): Promise<string> {
  await createPlan(page, '투두리스트', 3);
  await expect(page.locator('input[placeholder="나의 투두리스트"]')).toBeVisible();
  const key = await page.evaluate(
    (prefix) => Object.keys(localStorage).find((k) => k.startsWith(`${prefix}@acct:`)),
    DAILY_STORAGE_KEY,
  );
  expect(key).toBeTruthy();
  return key!;
}

test('계정을 바꾸면 이전 계정의 목록·검색 결과·메뉴가 남지 않는다', async ({ page }) => {
  const alice = testUser('alice');
  const bob = testUser('bob');

  await loginAs(page, alice);
  const aliceKey = await accountDailyKey(page);
  await seedDaily(
    page,
    dailyPlans(7).map((p) => ({ ...p, title: `Alice ${p.title}` })),
    aliceKey,
  );

  await openLibrary(page);
  const dialog = libraryDialog(page);
  await dialog.getByRole('searchbox').fill('Alice');
  await expect(dialog.getByText('검색 결과 7개')).toBeVisible();
  await page.keyboard.press('Escape');

  // 사이드바 항목 메뉴를 열어 둔 채로 계정을 바꾼다.
  await page.getByRole('button', { name: 'Alice 기록 7 메뉴' }).click();
  await expect(page.getByRole('button', { name: '복제' })).toBeVisible();
  await page.mouse.click(5, 5);
  await logout(page);

  await loginAs(page, bob);
  await expect(page.getByRole('button', { name: '복제' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '전체 플랜 보기 (0개)' })).toBeVisible();
  await openLibrary(page);
  await expect(dialog.getByText('저장된 플랜이 없습니다')).toBeVisible();
  await dialog.getByRole('searchbox').fill('Alice');
  await expect(dialog.getByText('검색 결과 0개')).toBeVisible();
  await page.keyboard.press('Escape');
  await logout(page);

  // 다시 Alice: 자기 플랜(심은 7개)이 모두 돌아온다. Bob 범위에는 아무것도 쓰지 않았다.
  await loginAs(page, alice);
  await expect(page.getByRole('button', { name: '전체 플랜 보기 (7개)' })).toBeVisible();
  const bobKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('sub-bob')));
  for (const key of bobKeys) {
    const raw = await page.evaluate((k) => localStorage.getItem(k), key);
    expect(raw).not.toContain('Alice');
  }
});
