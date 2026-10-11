import { test, expect } from '@playwright/test';
import { loginAs, mock, syncStatus, testUser } from './support/helpers';

test('첫 DB 조회가 실패해도 미저장 수정이 없으면 로그아웃할 수 있다', async ({ page }) => {
  await mock.reset();
  await mock.configure({ storageMode: 'error' });
  await loginAs(page, testUser('initial-db-error-logout'));
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  await expect(page.locator('aside')).toHaveCount(0);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Google 로그인', exact: true })).toBeVisible();
  expect((await mock.stats()).sessions).toBe(0);
});
