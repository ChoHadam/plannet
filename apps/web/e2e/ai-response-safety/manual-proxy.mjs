/**
 * 수동 브라우저 검증용 프록시 (자동 테스트는 쓰지 않는다).
 *
 * 전용 Web 서버(3520, start-server.mjs) 앞에서 인증·AI를 모의한다. 외부 AI·실제 Google을 호출하지 않는다.
 * - /api/runtime-config → 인증 on
 * - /api/v1/me·csrf·logout → 모의 계정 (기본 A). /__airs/account?sub=a|b|none 으로 바꾼다
 * - /api/chat → AIRS_CHAT_DELAY_MS(기본 8000ms) 뒤 마지막 사용자 메시지로 generate_actions 응답
 * - 그 외 → 3520으로 전달
 *
 * 실행: node e2e/ai-response-safety/manual-proxy.mjs  (브라우저: http://127.0.0.1:3521)
 */
import http from 'node:http';
import { AIRS_HOST, AIRS_PORT } from './server.config.mjs';

const PROXY_PORT = AIRS_PORT + 1;
const CHAT_DELAY_MS = Number(process.env.AIRS_CHAT_DELAY_MS || 8000);
const ACCOUNTS = {
  a: { externalSubject: 'airs-manual-a', name: 'Manual Tester A' },
  b: { externalSubject: 'airs-manual-b', name: 'Manual Tester B' },
};
const ACTIONS = ['아침 스트레칭', '주3회 헬스', '만보 걷기', '계단 이용', '수영 강습', '요가', '자전거', '홈트'];

let account = 'a';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function handleChat(req, res) {
  const body = JSON.parse((await readBody(req)) || '{}');
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '운동';
  const subGoal = String(lastUser).slice(0, 20);
  console.log(`[airs-proxy] chat "${subGoal}" → reply in ${CHAT_DELAY_MS}ms`);
  let aborted = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      aborted = true;
      console.log(`[airs-proxy] chat "${subGoal}" aborted by browser`);
    }
  });
  setTimeout(() => {
    if (aborted) return;
    json(res, 200, {
      message: `'${subGoal}'의 실천 계획을 만들었어요!`,
      action: 'generate_actions',
      data: { subGoal, actions: ACTIONS },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUSD: '0.000100' },
    });
    console.log(`[airs-proxy] chat "${subGoal}" delivered`);
  }, CHAT_DELAY_MS);
}

function forward(req, res) {
  const upstream = http.request(
    { host: AIRS_HOST, port: AIRS_PORT, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => json(res, 502, { error: 'upstream_unavailable' }));
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    switch (url.pathname) {
      case '/__airs/account':
        account = url.searchParams.get('sub') ?? 'a';
        return json(res, 200, { account });
      case '/api/runtime-config':
        return json(res, 200, { authEnabled: true, backupEnabled: false });
      case '/api/v1/me': {
        const user = ACCOUNTS[account];
        return user
          ? json(res, 200, { authenticated: true, user: { authProvider: 'google', ...user } })
          : json(res, 401, { authenticated: false });
      }
      case '/api/v1/csrf':
        return json(res, 200, { headerName: 'X-AIRS-CSRF', token: 'airs-manual-token' });
      case '/api/v1/logout':
        account = 'none';
        return json(res, 204);
      case '/oauth2/authorization/google':
        account = 'a';
        res.writeHead(302, { location: '/' });
        return res.end();
      case '/api/chat':
        return handleChat(req, res);
      default:
        return forward(req, res);
    }
  })
  .listen(PROXY_PORT, AIRS_HOST, () => console.log(`[airs-proxy] http://${AIRS_HOST}:${PROXY_PORT} → ${AIRS_PORT}`));
