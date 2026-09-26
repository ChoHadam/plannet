import { test, expect } from '@playwright/test';
import { HOST, PORTS } from './support/stack.config.mjs';
import {
  chatBody,
  createPlan,
  loginAs,
  logout,
  mock,
  SAME_ORIGIN_JSON,
  testUser,
} from './support/helpers';

// 모의 Spring(docs/contracts/auth-v1.md) + edge proxy 기준의 브라우저 흐름.
// 실제 Google 로그인은 포함하지 않는다.

test.beforeEach(async () => {
  await mock.reset();
});

test('같은 빌드에서 실행 시점 AUTH_ENABLED만으로 로그인 UI가 켜지고 꺼진다', async ({ page, request }) => {
  // 빌드는 인증 환경변수 없이 만들었다 (start-stack.mjs). 켜진 서버에서만 로그인 버튼이 보여야 한다.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();

  await page.goto(`http://${HOST}:${PORTS.webLocal}/`);
  await expect(page.locator('h1:has-text("Plannet")')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toHaveCount(0);

  const publicConfig = await (await request.get('/api/runtime-config')).json();
  const localConfig = await (await request.get(`http://${HOST}:${PORTS.webLocal}/api/runtime-config`)).json();
  expect(publicConfig).toEqual({ authEnabled: true, backupEnabled: false });
  expect(localConfig).toEqual({ authEnabled: false, backupEnabled: true });
});

test('로그인 → 새로고침 유지 → 로그아웃(CSRF) → 미인증', async ({ page }) => {
  const user = testUser('flow');
  await loginAs(page, user);

  await page.reload();
  await expect(page.getByText(user.name)).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();

  await logout(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();

  const stats = await mock.stats();
  expect(stats.logoutCalls).toBe(1);
  expect(stats.logoutRejected).toBe(0);
  expect(stats.sessions).toBe(0);
});

test('로그인 실패로 돌아오면 안내를 보여주고 주소에서 authError를 지운다', async ({ page }) => {
  await mock.configure({ loginMode: 'login_failed' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).click();

  // Next의 route announcer도 role=alert라 문구로 찾는다.
  await expect(page.getByRole('alert').filter({ hasText: '로그인하지 못했어요. 다시 시도해주세요.' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).searchParams.has('authError')).toBe(false);
});

test('로그아웃 CSRF 토큰이 무효면 한 번 다시 받아 재시도하고, 계속 거부되면 로그인 상태를 유지한다', async ({ page }) => {
  await loginAs(page, testUser('csrf'));

  // 첫 토큰을 가짜로 바꿔 403 csrf_invalid → 재발급 후 성공하는지 확인
  let tampered = false;
  await page.route('**/api/v1/csrf', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (!tampered) {
      tampered = true;
      body.token = 'stale-token';
    }
    await route.fulfill({ response, json: body });
  });
  await logout(page);
  let stats = await mock.stats();
  expect(stats.logoutRejected).toBe(1);
  expect(stats.logoutCalls).toBe(2);
  await page.unroute('**/api/v1/csrf');

  // 토큰이 계속 틀리면 실패 안내만 보이고 세션은 남는다
  await mock.reset();
  await loginAs(page, testUser('csrf2'));
  await page.route('**/api/v1/csrf', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), token: 'always-wrong' } });
  });
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '로그아웃하지 못했어요. 다시 시도해주세요.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  stats = await mock.stats();
  expect(stats.sessions).toBe(1);
});

test('첫 마일스톤: 로그인 → AI 요청 성공 → 로그아웃 → 같은 요청 거부', async ({ page }) => {
  await loginAs(page, testUser('milestone'));
  await createPlan(page, '만다라트', 0);

  await page.locator('button[title="AI 어시스턴트"]').click();
  await page.getByPlaceholder('메시지를 입력하세요...').fill('운동');
  await page.getByPlaceholder('메시지를 입력하세요...').press('Enter');
  await expect(page.getByText("'운동'의 실천 계획을 만들었어요!")).toBeVisible();
  await expect(page.getByText('적용된 실천 계획:')).toBeVisible();
  expect((await mock.stats()).aiCalls).toBe(1);

  // 같은 브라우저 컨텍스트(쿠키 공유)로 직접 호출해도 로그인 중에는 성공
  const before = await page.request.post('/api/chat', { headers: SAME_ORIGIN_JSON, data: chatBody('독서') });
  expect(before.status()).toBe(200);
  expect((await mock.stats()).aiCalls).toBe(2);

  await page.keyboard.press('Escape');
  await page.goto('/');
  await logout(page);

  const after = await page.request.post('/api/chat', { headers: SAME_ORIGIN_JSON, data: chatBody('독서') });
  expect(after.status()).toBe(401);
  expect((await after.json()).error).toBe('unauthenticated');
  expect((await mock.stats()).aiCalls).toBe(2);
});

test('로그인하지 않으면 AI 입력 대신 로그인 안내가 보인다', async ({ page }) => {
  await page.goto('/');
  await createPlan(page, '만다라트', 0);
  await page.locator('button[title="AI 어시스턴트"]').click();

  await expect(page.getByText('AI 어시스턴트는 로그인 후 사용할 수 있어요.')).toBeVisible();
  await expect(page.getByPlaceholder('메시지를 입력하세요...')).toHaveCount(0);
});

test('세션이 만료되면 AI 요청이 401로 거부되고 로그인 안내로 바뀐다', async ({ page }) => {
  await loginAs(page, testUser('expire'));
  await createPlan(page, '만다라트', 0);
  await page.locator('button[title="AI 어시스턴트"]').click();

  await mock.expireSessions();
  await page.getByPlaceholder('메시지를 입력하세요...').fill('운동');
  await page.getByPlaceholder('메시지를 입력하세요...').press('Enter');

  await expect(page.getByText('로그인이 필요해요.')).toBeVisible();
  await expect(page.getByText('AI 어시스턴트는 로그인 후 사용할 수 있어요.')).toBeVisible();
  expect((await mock.stats()).aiCalls).toBe(0);
});

test('인증 서버 장애 시 상태 확인 실패를 표시하고 AI를 쓸 수 없다', async ({ page }) => {
  await loginAs(page, testUser('outage'));
  await mock.configure({ meMode: 'error' });

  await page.reload();
  await expect(page.getByRole('status')).toContainText('로그인 상태를 확인할 수 없어요');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();

  await createPlan(page, '만다라트', 0);
  await page.locator('button[title="AI 어시스턴트"]').click();
  await expect(page.getByText('로그인 상태를 확인할 수 없어 AI 어시스턴트를 쓸 수 없어요.')).toBeVisible();

  // 복구 후 다시 시도하면 로그인 상태로 돌아온다
  await page.keyboard.press('Escape');
  await mock.configure({ meMode: 'ok' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  expect((await mock.stats()).aiCalls).toBe(0);
});

test('AI 응답 형식이 어긋나면 그리드에 적용하지 않고 안내만 한다', async ({ page }) => {
  await loginAs(page, testUser('malformed'));
  await mock.configure({ aiMode: 'malformed' });
  await createPlan(page, '만다라트', 0);

  await page.locator('button[title="AI 어시스턴트"]').click();
  await page.getByPlaceholder('메시지를 입력하세요...').fill('운동');
  await page.getByPlaceholder('메시지를 입력하세요...').press('Enter');

  await expect(page.getByText('응답을 처리하는 중 문제가 발생했어요. 다시 말씀해주세요.')).toBeVisible();
  await expect(page.getByText('적용된 실천 계획:')).toHaveCount(0);
  expect((await mock.stats()).aiCalls).toBe(1);
});

test('공개 환경에서는 백업 진입점이 없다', async ({ page }) => {
  await loginAs(page, testUser('backup-ui'));
  await expect(page.locator('button[title="백업 복원"]')).toHaveCount(0);
});
