import { expect, test } from '@playwright/test';
import { APP_NAMESPACE, HOST, HTTPS_PORT, MOCK_NAMESPACE, PUBLIC_CALLBACK, PUBLIC_ORIGIN, SESSION_COOKIE } from './support/env';
import { kubectl, probeFromPod } from './support/kube';
import { mockStats, raw, RawResponse, setCookies } from './support/raw';

/**
 * [모의 인증 검증] 진입점(Envoy Gateway) 라우팅·HTTPS·헤더·쿠키·공개 설정.
 * 실제 Spring·Web 이미지에 Google·AI 대역을 연결한 kind 클러스터 기준이다.
 */

/** Next.js 응답은 RSC용 Vary 헤더를 붙인다. Spring 응답에는 없다. */
const servedByWeb = (res: RawResponse) => String(res.headers.vary ?? '').includes('next-router-state-tree');

const JSON_POST = { 'content-type': 'application/json', origin: PUBLIC_ORIGIN };

test.describe('HTTPS와 HTTP 전환', () => {
  test('HTTP 요청은 경로·쿼리를 유지한 채 HTTPS로 301 전환되고 앱에 닿지 않는다', async () => {
    for (const path of ['/', '/api/v1/me', '/oauth2/authorization/google', '/api/chat?x=1']) {
      const res = await raw(path, { scheme: 'http' });
      expect(res.status, path).toBe(301);
      expect(res.headers.location, path).toBe(`${PUBLIC_ORIGIN}${path}`);
      expect(setCookies(res), path).toEqual([]);
    }
  });

  test('등록되지 않은 Host는 라우팅되지 않는다', async () => {
    const res = await raw('/api/v1/health', { hostHeader: `evil.example:${HTTPS_PORT}` });
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('UP');
  });
});

test.describe('같은 origin 경로 분리', () => {
  test('Spring 경로: /api/v1/**, /oauth2/**, /login/oauth2/**', async () => {
    const health = await raw('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.json()).toEqual({ status: 'UP' });
    expect(servedByWeb(health)).toBe(false);
    // Spring Security는 요청이 HTTPS일 때만 HSTS를 붙인다 → 신뢰 프록시의 X-Forwarded-Proto가 반영됨
    expect(health.headers['strict-transport-security']).toContain('max-age=');

    const me = await raw('/api/v1/me');
    expect(me.status).toBe(401);
    expect(me.json()).toEqual({ authenticated: false });

    // 미인증 보호 경로는 로그인 HTML redirect 없이 401 JSON (Accept와 무관)
    const other = await raw('/api/v1/plans', { headers: { accept: 'text/html' } });
    expect(other.status).toBe(401);
    expect(other.json()).toEqual({ authenticated: false });

    // callback 경로는 Spring이 처리한다 (state 없는 요청 → 실패 redirect)
    const callback = await raw('/login/oauth2/code/google?code=x&state=unknown');
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/?authError=login_failed');
  });

  test('Web 경로: /api/chat, /api/backup, /api/runtime-config 와 나머지', async () => {
    const config = await raw('/api/runtime-config');
    expect(config.status).toBe(200);
    expect(servedByWeb(config)).toBe(true);
    expect(config.json()).toEqual({ authEnabled: true, backupEnabled: false });

    // Spring이었다면 401 JSON. Next route는 POST만 있어 405.
    const chat = await raw('/api/chat');
    expect(chat.status).toBe(405);
    expect(servedByWeb(chat)).toBe(true);

    const page = await raw('/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    // 진입점이 Web 응답에 붙이는 보안 헤더
    expect(page.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['x-frame-options']).toBe('DENY');
    expect(page.headers['x-powered-by']).toBeUndefined();

    // PathPrefix는 경로 요소 단위: /api/v1x, /api/v10 은 Web(404)
    for (const path of ['/api/v1x', '/api/v10/me', '/oauth2x']) {
      const res = await raw(path);
      expect(res.status, path).toBe(404);
      expect(servedByWeb(res), path).toBe(true);
    }
  });

  test('공개 설정에서 서버 백업 GET/POST는 차단된다', async () => {
    const list = await raw('/api/backup');
    expect(list.status).toBe(403);
    expect(list.json()).toMatchObject({ error: 'backup_disabled' });

    const file = await raw('/api/backup?file=snapshot-2026-01-01T00-00-00-000Z.json');
    expect(file.status).toBe(403);

    const save = await raw('/api/backup', { method: 'POST', headers: JSON_POST, body: '{"plannet-mandalart":"{}"}' });
    expect(save.status).toBe(403);
    expect(save.json()).toMatchObject({ error: 'backup_disabled' });
  });
});

test.describe('callback 주소와 세션 쿠키', () => {
  test('로그인 시작은 공개 HTTPS callback으로 대역 Google에 redirect하고 Secure 쿠키를 준다', async () => {
    const before = await mockStats();
    const start = await raw('/oauth2/authorization/google');
    expect(start.status).toBe(302);
    const location = new URL(start.headers.location ?? '');
    expect(location.searchParams.get('redirect_uri')).toBe(PUBLIC_CALLBACK);
    expect(location.searchParams.get('scope')?.split(' ')).toEqual(expect.arrayContaining(['openid', 'profile', 'email']));

    const cookie = setCookies(start).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('Path=/;');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toMatch(/Domain=/i);

    // 대역 Google이 이 redirect_uri를 등록된 값으로 받아들이는지 (Google의 redirect_uri_mismatch 재현)
    const consent = await raw(`${location.pathname}${location.search}`, { host: location.hostname });
    expect(consent.status).toBe(200);
    expect((await mockStats()).redirectMismatches).toBe(before.redirectMismatches);
  });

  test('클라이언트가 보낸 X-Forwarded-* 로 callback 주소를 바꿀 수 없다', async () => {
    const start = await raw('/oauth2/authorization/google', {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http', 'x-forwarded-port': '8443', forwarded: 'host=evil.example' },
    });
    expect(start.status).toBe(302);
    expect(new URL(start.headers.location ?? '').searchParams.get('redirect_uri')).toBe(PUBLIC_CALLBACK);
    expect(setCookies(start).join()).toContain('Secure');
  });
});

test.describe('로그인 전 접근 거부', () => {
  test('/api/chat 은 세션 없이 401, 교차 출처는 403, 외부 AI를 호출하지 않는다', async () => {
    const before = await mockStats();
    const body = JSON.stringify({ messages: [{ role: 'user', content: '운동' }], assistedCount: 0 });

    const noSession = await raw('/api/chat', { method: 'POST', headers: JSON_POST, body });
    expect(noSession.status).toBe(401);
    expect(noSession.json()).toMatchObject({ error: 'unauthenticated' });

    const fakeSession = await raw('/api/chat', {
      method: 'POST',
      headers: { ...JSON_POST, cookie: `${SESSION_COOKIE}=forged-session-id` },
      body,
    });
    expect(fakeSession.status).toBe(401);

    const crossOrigin = await raw('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `https://${HOST}:8443` },
      body,
    });
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.json()).toMatchObject({ error: 'csrf_rejected' });

    expect((await mockStats()).aiCalls).toBe(before.aiCalls);
  });
});

test.describe('내부 서비스 격리', () => {
  test('Web/API Service는 ClusterIP이고 Gateway 밖의 pod는 직접 접근할 수 없다', async () => {
    const services = JSON.parse(kubectl(['-n', APP_NAMESPACE, 'get', 'svc', '-o', 'json'])) as {
      items: { metadata: { name: string }; spec: { type: string } }[];
    };
    for (const name of ['plannet-web', 'plannet-api']) {
      expect(services.items.find((s) => s.metadata.name === name)?.spec.type, name).toBe('ClusterIP');
    }
    const deployments = JSON.parse(kubectl(['-n', APP_NAMESPACE, 'get', 'deploy', '-o', 'json'])) as {
      items: { metadata: { name: string }; spec: { replicas: number; strategy: { type: string } } }[];
    };
    for (const item of deployments.items) {
      expect(item.spec.replicas, item.metadata.name).toBe(1);
      expect(item.spec.strategy.type, item.metadata.name).toBe('Recreate');
    }

    const result = probeFromPod(MOCK_NAMESPACE, [
      'http://mock-external.plannet-mocks:8080/healthz', // 대조군: 같은 pod에서 허용된 통신은 된다
      'http://plannet-api.plannet:8080/api/v1/health',
      'http://plannet-web.plannet:3000/api/runtime-config',
    ]);
    expect(result['http://mock-external.plannet-mocks:8080/healthz']).toBe('200');
    expect(result['http://plannet-api.plannet:8080/api/v1/health']).toMatch(/^ERR:/);
    expect(result['http://plannet-web.plannet:3000/api/runtime-config']).toMatch(/^ERR:/);
  });
});
