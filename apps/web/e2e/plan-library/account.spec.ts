import { test, expect } from '@playwright/test';
import {
  dailyPlans,
  libraryDialog,
  loginAs,
  logout,
  mock,
  openLibrary,
  testUser,
} from './helpers';

// 계정 저장 범위가 바뀌면 전체 목록도 그 계정의 플랜만 보여준다.

test.beforeEach(async () => {
  await mock.reset();
});

test('계정을 바꾸면 이전 계정의 목록·검색 결과·메뉴가 남지 않는다', async ({ page }) => {
  const alice = testUser('alice');
  const bob = testUser('bob');

  // Alice의 기록 7개는 DB에 있다 (로그인한 서비스 모드는 브라우저에 기록을 저장하지 않는다)
  await mock.seedPlanner(alice, dailyPlans(7).map((p) => ({ kind: 'daily', id: p.id, data: { ...p, title: `Alice ${p.title}` } })));
  await loginAs(page, alice);

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

  // 다시 Alice: 자기 플랜(심은 7개)이 DB에서 모두 돌아온다. Bob 계정 DB에는 아무것도 쓰지 않았다.
  await loginAs(page, alice);
  await expect(page.getByRole('button', { name: '전체 플랜 보기 (7개)' })).toBeVisible();
  expect((await mock.planner(bob)).records).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('plannet')))).toEqual([]);
});
