import { expect, test } from '@playwright/test';
import { AI_LIMIT_PER_MINUTE, HOST, SESSION_COOKIE } from './support/env';
import { restartWeb, scaleApi } from './support/kube';
import { mockStats } from './support/raw';
import { chatBody, login, openMandalartAssistant, pageFetch, sessionCookie } from './support/ui';

/**
 * [모의 인증 검증] 브라우저 사용자 흐름. 실제 Spring 세션·Web 서버 검증을 거치고,
 * Google 동의 화면과 AI만 대역을 쓴다.
 */

test('로그인 → 보호 API·AI 사용 → 호출 한도 → CSRF 로그아웃 → 같은 요청 거부', async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  await restartWeb(); // 이전 실행의 호출 한도 카운터를 비운다
  await login(page);
  await page.screenshot({ path: testInfo.outputPath('01-logged-in.png') });

  // 세션 쿠키 속성 (브라우저가 저장한 값 기준)
  const cookie = await sessionCookie(context);
  expect(cookie).toMatchObject({ domain: HOST, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });

  const me = await pageFetch(page, '/api/v1/me');
  expect(me.status).toBe(200);
  expect(me.json).toMatchObject({
    authenticated: true,
    user: { authProvider: 'google', externalSubject: 'verify-sub-0001', name: '검증 사용자' },
  });

  // UI로 AI 요청 (Web 서버가 내부 주소로 Spring 세션을 확인한 뒤 AI 대역 호출)
  const before = await mockStats();
  await openMandalartAssistant(page);
  const input = page.getByPlaceholder('메시지를 입력하세요...');
  await input.fill('운동');
  await input.press('Enter');
  await expect(page.getByText("'운동'의 실천 계획을 만들었어요!")).toBeVisible();
  await expect(page.getByText('적용된 실천 계획:')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-ai-reply.png') });
  expect((await mockStats()).aiCalls).toBe(before.aiCalls + 1);

  // 분당 한도(검증 overlay: 3회)까지 성공하고 다음 요청은 429
  for (let i = 1; i < AI_LIMIT_PER_MINUTE; i++) {
    const ok = await pageFetch(page, '/api/chat', { method: 'POST', body: chatBody('독서') });
    expect(ok.status, `call ${i + 1}`).toBe(200);
  }
  const limited = await pageFetch(page, '/api/chat', { method: 'POST', body: chatBody('독서') });
  expect(limited.status).toBe(429);
  expect(limited.json).toMatchObject({ error: 'rate_limited' });
  expect(Number(limited.retryAfter)).toBeGreaterThan(0);
  expect((await mockStats()).aiCalls).toBe(before.aiCalls + AI_LIMIT_PER_MINUTE);

  // 제약: 한도는 Web 프로세스 메모리에 있어 재시작하면 초기화된다 (API 세션은 유지)
  await restartWeb();
  expect((await pageFetch(page, '/api/chat', { method: 'POST', body: chatBody('독서') })).status).toBe(200);
  const aiCallsBeforeLogout = before.aiCalls + AI_LIMIT_PER_MINUTE + 1;
  expect((await mockStats()).aiCalls).toBe(aiCallsBeforeLogout);

  // CSRF 토큰 없는 로그아웃은 거부되고 세션은 유지된다
  const noToken = await pageFetch(page, '/api/v1/logout', { method: 'POST' });
  expect(noToken.status).toBe(403);
  expect(noToken.json).toEqual({ error: 'csrf_invalid' });
  expect((await pageFetch(page, '/api/v1/me')).status).toBe(200);

  // UI 로그아웃: /api/v1/csrf → POST /api/v1/logout (토큰 헤더) → 204
  // AI 응답이 그리드에 반영된 변경분이 DB에 저장된 뒤 이동한다 (미저장 상태면 이탈 확인 창이 뜬다)
  await expect(page.getByTestId('storage-sync-status')).toHaveAttribute('data-phase', 'saved');
  await page.goto('/'); // AI 패널을 닫고 헤더의 로그아웃 버튼으로 돌아간다
  const staleSession = cookie!.value;
  const logoutResponse = page.waitForResponse((res) => res.url().endsWith('/api/v1/logout') && res.request().method() === 'POST');
  await page.getByRole('button', { name: '로그아웃' }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  expect(await sessionCookie(context)).toBeUndefined();
  expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);

  // 로그아웃 전 쿠키를 다시 넣어도 서버 세션이 무효화되어 거부된다
  await context.addCookies([{ ...cookie!, value: staleSession }]);
  expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);
  const afterLogout = await pageFetch(page, '/api/chat', { method: 'POST', body: chatBody('독서') });
  expect(afterLogout.status).toBe(401);
  expect(afterLogout.json).toMatchObject({ error: 'unauthenticated' });
  expect((await mockStats()).aiCalls).toBe(aiCallsBeforeLogout);
});

test('Google 동의 거부 시 로그인 실패 안내가 보이고 세션이 생기지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).first().click();
  await page.getByRole('button', { name: '거부' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '로그인하지 못했어요. 다시 시도해주세요.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);
});

test('API 장애 시 보호 기능이 차단되고, 재시작 후에는 세션이 초기화된다', async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  await login(page);
  const cookie = await sessionCookie(context);
  const before = await mockStats();

  try {
    scaleApi(0);

    // 진입점: Spring 경로는 upstream 없음(503). Web은 계속 응답한다.
    expect((await pageFetch(page, '/api/v1/me')).status).toBe(503);
    expect((await pageFetch(page, '/api/runtime-config')).status).toBe(200);

    // Web 서버의 세션 확인 실패 → fail closed (캐시된 결과로 허용하지 않음)
    const chat = await pageFetch(page, '/api/chat', { method: 'POST', body: chatBody('운동') });
    expect(chat.status).toBe(503);
    expect(chat.json).toMatchObject({ error: 'auth_unavailable' });
    expect((await mockStats()).aiCalls).toBe(before.aiCalls);

    // 로그인 확인에 실패하면 랜딩의 다시 시도만 보이고 플래너·AI 진입점은 열리지 않는다
    await page.reload();
    await expect(page.getByRole('status')).toContainText('로그인 상태를 확인할 수 없어요');
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
    await expect(page.locator('button[title="AI 어시스턴트"]')).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('03-api-outage.png') });
  } finally {
    scaleApi(1);
  }

  // 메모리 세션이라 재시작 후 기존 쿠키는 더 이상 유효하지 않다 (재로그인 필요)
  expect(await sessionCookie(context)).toMatchObject({ name: SESSION_COOKIE, value: cookie!.value });
  expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  await login(page);
});
