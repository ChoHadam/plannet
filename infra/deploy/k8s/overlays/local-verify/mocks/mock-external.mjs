/**
 * 로컬 검증용 외부 서비스 대역 (의존성 없는 Node 서버).
 *
 * 1. Google OIDC 대역: /authorize(동의 화면) → /token → /jwks, /userinfo
 *    - 등록되지 않은 redirect_uri는 Google처럼 400 redirect_uri_mismatch로 거부한다.
 *    - token 요청의 client 인증(client_secret_basic/post)과 redirect_uri 일치를 확인한다.
 * 2. OpenAI 호환 AI 대역: POST /v1/chat/completions → respond_to_user tool call
 * 3. 검증용: GET /__stats, POST /__reset
 *
 * 실제 Google·유료 AI를 호출하지 않는다. 키는 기동 시 새로 만든다.
 */
import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const CLIENT_ID = required('MOCK_CLIENT_ID');
const CLIENT_SECRET = required('MOCK_CLIENT_SECRET');
const ISSUER = required('MOCK_ISSUER');
const ALLOWED_REDIRECT_URIS = required('MOCK_ALLOWED_REDIRECT_URIS').split(',').map((v) => v.trim());
const AI_API_KEY = required('MOCK_AI_API_KEY');

const PROFILE = {
  sub: 'verify-sub-0001',
  name: '검증 사용자',
  email: 'verify-user@example.test',
};
const SECOND_PROFILE = { sub: 'verify-sub-0002', name: '두 번째 검증 사용자', email: 'verify-second@example.test' };
const AI_ACTIONS = ['아침 스트레칭', '주3회 헬스장', '계단 이용하기', '만보 걷기', '홈트 루틴', '주말 등산', '수영 배우기', '운동 기록'];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY_ID = crypto.randomUUID();
const JWKS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KEY_ID, alg: 'RS256', use: 'sig' }] };

const grants = new Map(); // code → { nonce, redirectUri }
const accessTokens = new Map();
let stats;
function resetStats() {
  stats = { authorizeRequests: 0, redirectMismatches: 0, tokensIssued: 0, tokenRejected: 0, aiCalls: 0, lastAuthorize: null };
}
resetStats();

const b64url = (input) => Buffer.from(input).toString('base64url');

function signIdToken(nonce, profile) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KEY_ID };
  const claims = {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: profile.sub,
    iat: now,
    exp: now + 300,
    nonce,
    name: profile.name,
    email: profile.email,
    email_verified: true,
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
  return `${body}.${signature}`;
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, {
    'content-type': isJson ? 'application/json' : 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function validateAuthorize(params) {
  if (params.get('client_id') !== CLIENT_ID) return 'invalid_client';
  if (!ALLOWED_REDIRECT_URIS.includes(params.get('redirect_uri') ?? '')) return 'redirect_uri_mismatch';
  if (params.get('response_type') !== 'code') return 'unsupported_response_type';
  if (!(params.get('scope') ?? '').split(' ').includes('openid')) return 'invalid_scope';
  if (!params.get('state')) return 'invalid_request';
  return null;
}

function consentPage(params) {
  const hidden = ['redirect_uri', 'state', 'nonce']
    .map((key) => `<input type="hidden" name="${key}" value="${escapeHtml(params.get(key) ?? '')}">`)
    .join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Mock Google 로그인</title></head>
<body><main><h1>Mock Google 로그인 (검증용 대역)</h1>
<p>client_id: <code>${escapeHtml(params.get('client_id'))}</code></p>
<p>redirect_uri: <code data-testid="redirect-uri">${escapeHtml(params.get('redirect_uri'))}</code></p>
<p>계정: ${escapeHtml(PROFILE.name)} (${escapeHtml(PROFILE.email)})</p>
<form method="post" action="/authorize/decision">${hidden}
<button type="submit" name="decision" value="approve">테스트 계정으로 계속</button>
<button type="submit" name="decision" value="approve-second">두 번째 계정으로 계속</button>
<button type="submit" name="decision" value="deny">거부</button>
</form></main></body></html>`;
}

function redirectTo(res, base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  send(res, 302, '', { location: url.toString() });
}

function clientAuthenticated(req, form) {
  const basic = req.headers.authorization?.match(/^Basic (.+)$/)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, 'base64').toString('utf8').split(':').map(decodeURIComponent);
    return id === CLIENT_ID && secret === CLIENT_SECRET;
  }
  return form.get('client_id') === CLIENT_ID && form.get('client_secret') === CLIENT_SECRET;
}

function aiResponse(userText) {
  const subGoal = userText.slice(0, 20) || '운동';
  const args = {
    message: `'${subGoal}'의 실천 계획을 만들었어요!\n\n두 번째 하위 목표도 도와드릴까요?`,
    action: 'generate_actions',
    subGoal,
    actions: AI_ACTIONS,
  };
  return {
    id: 'mock-completion',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_mock', type: 'function', function: { name: 'respond_to_user', arguments: JSON.stringify(args) } }],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://mock');
  const { pathname } = url;

  if (pathname === '/healthz') return send(res, 200, { ok: true });
  if (pathname === '/__stats') return send(res, 200, stats);
  if (pathname === '/__reset' && req.method === 'POST') {
    resetStats();
    return send(res, 200, { ok: true });
  }

  if (pathname === '/authorize' && req.method === 'GET') {
    stats.authorizeRequests += 1;
    stats.lastAuthorize = {
      client_id: url.searchParams.get('client_id'),
      redirect_uri: url.searchParams.get('redirect_uri'),
      scope: url.searchParams.get('scope'),
    };
    const error = validateAuthorize(url.searchParams);
    if (error === 'redirect_uri_mismatch') stats.redirectMismatches += 1;
    if (error) return send(res, 400, `<!doctype html><h1>Error 400: ${error}</h1>`);
    return send(res, 200, consentPage(url.searchParams));
  }

  if (pathname === '/authorize/decision' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const redirectUri = form.get('redirect_uri') ?? '';
    if (!ALLOWED_REDIRECT_URIS.includes(redirectUri)) return send(res, 400, '<h1>Error 400: redirect_uri_mismatch</h1>');
    const state = form.get('state') ?? '';
    const decision = form.get('decision');
    if (!['approve', 'approve-second'].includes(decision)) return redirectTo(res, redirectUri, { error: 'access_denied', state });
    const code = crypto.randomUUID();
    grants.set(code, { nonce: form.get('nonce') ?? '', redirectUri, profile: decision === 'approve-second' ? SECOND_PROFILE : PROFILE });
    return redirectTo(res, redirectUri, { code, state });
  }

  if (pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const grant = grants.get(form.get('code') ?? '');
    grants.delete(form.get('code') ?? '');
    if (!clientAuthenticated(req, form) || !grant || grant.redirectUri !== form.get('redirect_uri')) {
      stats.tokenRejected += 1;
      return send(res, 400, { error: 'invalid_grant' });
    }
    stats.tokensIssued += 1;
    const accessToken = crypto.randomUUID();
    accessTokens.set(accessToken, grant.profile);
    return send(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid profile email',
      id_token: signIdToken(grant.nonce, grant.profile),
    });
  }

  if (pathname === '/jwks') return send(res, 200, JWKS);

  if (pathname === '/userinfo') {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const profile = accessTokens.get(token);
    if (!profile) return send(res, 401, { error: 'invalid_token' });
    return send(res, 200, { ...profile, email_verified: true });
  }

  if (pathname === '/v1/chat/completions' && req.method === 'POST') {
    if (req.headers.authorization !== `Bearer ${AI_API_KEY}`) return send(res, 401, { error: 'invalid_api_key' });
    stats.aiCalls += 1;
    const body = JSON.parse((await readBody(req)) || '{}');
    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';
    return send(res, 200, aiResponse(String(lastUser)));
  }

  return send(res, 404, { error: 'not_found', path: pathname });
}

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('[mock-external]', error);
      if (!res.headersSent) send(res, 500, { error: 'mock_failure' });
    });
  })
  .listen(PORT, () => console.log(`[mock-external] listening on ${PORT}`));
