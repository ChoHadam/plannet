import { test, expect, Page } from '@playwright/test';
import { createPlan, expectPlannerClosed, loginAs, logout, mock, rawLocalDaily, seedLocalDaily, syncStatus, testUser } from './support/helpers';

// 로그인 전 랜딩 게이트: 인증이 켜진 환경에서는 로그인 확인 전·실패·미로그인 상태에 플래너를 열지 않는다.
// 이 브라우저에 남은 로그인 전 원본(고유 제목)이 어느 상태에서도 화면에 나오지 않고, 원본 문자열도 바뀌지 않는지 본다.

const PRIVATE_TITLE = `비공개 원본 ${Date.now()}`;

test.beforeEach(async () => {
  await mock.reset();
});

const retryButton = (page: Page) => page.getByRole('button', { name: '다시 시도' });
const unavailableStatus = (page: Page) => page.getByRole('status').filter({ hasText: '로그인 상태를 확인할 수 없어요' });

test('미로그인 랜딩: 로그인 버튼 하나만 있고 로그인 전 원본·플래너가 없다', async ({ page }) => {
  const source = await seedLocalDaily(page, PRIVATE_TITLE);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('큰 목표를');
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toHaveCount(1);
  await expect(page.getByText('예시 화면', { exact: false })).toBeVisible();
  await expectPlannerClosed(page, [PRIVATE_TITLE]);

  // 키보드로 로그인 버튼에 도달할 수 있다
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeFocused();
  expect(await rawLocalDaily(page)).toBe(source);
});

test('확인 중(느린 me)에는 대기 화면만 보이고 원본이 표시되지 않는다', async ({ page }) => {
  const source = await seedLocalDaily(page, PRIVATE_TITLE);
  await page.route('**/api/v1/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('로그인 상태를 확인하고 있어요');
  await expectPlannerClosed(page, [PRIVATE_TITLE]);
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await expectPlannerClosed(page, [PRIVATE_TITLE]);
  expect(await rawLocalDaily(page)).toBe(source);
});

for (const meMode of ['error', 'down', 'invalid'] as const) {
  test(`me 확인 실패(${meMode})는 로컬 기록으로 대체하지 않고 다시 시도만 제공한다`, async ({ page }) => {
    const source = await seedLocalDaily(page, PRIVATE_TITLE);
    await mock.configure({ meMode });
    await page.reload();
    await expect(unavailableStatus(page)).toBeVisible();
    await expect(retryButton(page)).toBeVisible();
    await expectPlannerClosed(page, [PRIVATE_TITLE]);
    expect(await rawLocalDaily(page)).toBe(source);
  });
}

const BROKEN_CONFIGS: { name: string; fulfill: Parameters<Page['route']>[1] }[] = [
  { name: '네트워크 실패', fulfill: (route) => route.abort('failed') },
  { name: '500', fulfill: (route) => route.fulfill({ status: 500, json: { authEnabled: false, backupEnabled: false } }) },
  { name: 'JSON 아님', fulfill: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'not-json' }) },
  { name: '필드 누락', fulfill: (route) => route.fulfill({ json: { backupEnabled: false } }) },
  { name: '문자열 false', fulfill: (route) => route.fulfill({ json: { authEnabled: 'false', backupEnabled: false } }) },
];

for (const { name, fulfill } of BROKEN_CONFIGS) {
  test(`runtime-config ${name}: 로컬 모드로 열지 않고 확인 실패 화면을 보인다`, async ({ page }) => {
    const source = await seedLocalDaily(page, PRIVATE_TITLE);
    await page.route('**/api/runtime-config', fulfill);
    await page.reload();
    await expect(unavailableStatus(page)).toBeVisible();
    await expectPlannerClosed(page, [PRIVATE_TITLE]);
    // 설정을 받지 못했으면 로그인 여부도 묻지 않는다
    await expect(page.getByRole('button', { name: 'Google 로그인' })).toHaveCount(0);
    expect(await rawLocalDaily(page)).toBe(source);

    // 설정이 돌아오면 다시 시도로 복구된다
    await page.unroute('**/api/runtime-config');
    await retryButton(page).click();
    await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  });
}

test('로그아웃 후 새로고침·뒤로 가기에도 계정 기록과 원본이 보이지 않고, 재로그인은 그 계정만 복원한다', async ({ page }) => {
  const alice = testUser('landing-alice');
  const aliceTitle = `Alice 비공개 ${Date.now()}`;
  const source = await seedLocalDaily(page, PRIVATE_TITLE);

  await loginAs(page, alice);
  await expect(page.locator('aside').getByText(PRIVATE_TITLE)).toHaveCount(0);
  await createPlan(page, '투두리스트', 3);
  await page.locator('input[placeholder="나의 투두리스트"]').fill(aliceTitle);
  await expect(page.locator('aside').getByText(aliceTitle)).toBeVisible();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  // 로그인 상태의 기록을 하나 더 만들어 뒤로 가기가 그 화면으로 돌아갈 수 있게 한다
  await page.goto('/');
  await expect(page.locator('aside').getByText(aliceTitle)).toBeVisible();

  await logout(page);
  await expectPlannerClosed(page, [aliceTitle, PRIVATE_TITLE]);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await expectPlannerClosed(page, [aliceTitle, PRIVATE_TITLE]);

  await page.goBack();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await expectPlannerClosed(page, [aliceTitle, PRIVATE_TITLE]);

  await loginAs(page, alice);
  await expect(page.locator('aside').getByText(aliceTitle)).toBeVisible();
  await expect(page.locator('aside').getByText(PRIVATE_TITLE)).toHaveCount(0);
  await logout(page);

  await loginAs(page, testUser('landing-bob'));
  await expect(page.locator('aside').getByText(aliceTitle)).toHaveCount(0);
  await expect(page.locator('aside').getByText(PRIVATE_TITLE)).toHaveCount(0);
  expect(await rawLocalDaily(page)).toBe(source);
});

test('로그인 실패 안내는 랜딩에 접근 가능한 alert로 남는다', async ({ page }) => {
  await mock.configure({ loginMode: 'login_failed' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '로그인하지 못했어요. 다시 시도해주세요.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await expectPlannerClosed(page, []);
});
