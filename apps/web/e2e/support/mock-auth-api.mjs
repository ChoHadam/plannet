/**
 * 모의 Spring 인증 서버 + 모의 AI(OpenAI 호환) 서버.
 * docs/contracts/auth-v1.md 계약을 따른다. 실제 Google·외부 AI를 호출하지 않는다.
 *
 * - GET  /oauth2/authorization/google → /login/oauth2/code/google 로 redirect (Google 대신)
 * - GET  /login/oauth2/code/google    → 새 세션 id 발급(PLANNET_SESSION, HttpOnly) 후 / 로 redirect
 *                                       실패 모드면 /?authError=login_failed
 * - GET  /api/v1/me                   → 200 { authenticated: true, user } | 401 { authenticated: false }
 * - GET  /api/v1/csrf                 → 200 { headerName, token } (세션에 묶임, 없으면 익명 세션 생성)
 * - POST /api/v1/logout               → 세션의 토큰과 헤더가 같으면 204, 아니면 403 { error: 'csrf_invalid' }
 * - GET  /api/v1/planner, POST /api/v1/planner/commit
 *                                     → docs/contracts/planner-storage-v1.md 흉내(메모리 DB). 계정 헤더·CSRF·버전·requestId 재전송 검사
 * - POST /mock-ai/v1/chat/completions → tool call 응답. 호출 횟수를 센다.
 * - /__mock/*                         → 테스트 제어용 (edge를 거치지 않고 직접 호출)
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { HOST, MOCK_AI_PATH, PORTS, SESSION_COOKIE } from './stack.config.mjs';

const CSRF_HEADER_NAME = 'X-CSRF-TOKEN';
const SLOW_RESPONSE_MS = 5000;

const DEFAULT_USER = {
  sub: 'mock-sub-default',
  email: 'default@example.test',
  name: 'Default Tester',
};

function initialState() {
  return {
    sessions: new Map(),
    nextUser: DEFAULT_USER,
    meMode: 'ok', // ok | error | slow | down | invalid
    loginMode: 'ok', // ok | login_failed
    aiMode: 'ok', // ok | malformed
    storageMode: 'ok', // ok | disabled(me.storageEnabled=false) | error(저장 API 503)
    stats: { aiCalls: 0, meCalls: 0, logoutCalls: 0, logoutRejected: 0, plannerReads: 0, commits: 0 },
    lastAiRequest: null,
    /** userId → Map(kind:id → record) */
    planner: new Map(),
    /** `${userId}:${requestId}` → { body, records } */
    receipts: new Map(),
    /** 받은 commit requestId 순서 (중복 전송 확인용) */
    commitRequests: [],
  };
}

/** 외부 subject를 고정된 내부 UUID로 바꾼다 (Spring의 사용자 테이블 흉내) */
export function mockUserId(sub) {
  const hex = crypto.createHash('sha256').update(`plannet-mock:${sub}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function plannerOf(userId) {
  if (!state.planner.has(userId)) state.planner.set(userId, new Map());
  return state.planner.get(userId);
}

const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

let state = initialState();

function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf-8');
  return text ? JSON.parse(text) : {};
}

function currentSession(req) {
  const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return sid ? state.sessions.get(sid) : undefined;
}

function toolCallResponse(args) {
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
          tool_calls: [
            {
              id: 'call_mock',
              type: 'function',
              function: { name: 'respond_to_user', arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

const MOCK_ACTIONS = ['아침 스트레칭', '주3회 헬스장', '계단 이용하기', '만보 걷기', '홈트 루틴', '주말 등산', '수영 배우기', '운동 기록'];

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // ---- 테스트 제어 ----
  if (pathname === '/__mock/health') return send(res, 200, { ok: true });
  if (pathname === '/__mock/reset' && req.method === 'POST') {
    state = initialState();
    return send(res, 200, { ok: true });
  }
  if (pathname === '/__mock/config' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.meMode) state.meMode = body.meMode;
    if (body.aiMode) state.aiMode = body.aiMode;
    if (body.loginMode) state.loginMode = body.loginMode;
    if (body.nextUser) state.nextUser = body.nextUser;
    if (body.storageMode) state.storageMode = body.storageMode;
    return send(res, 200, { ok: true });
  }
  // 메모리 DB 조회·직접 수정 (다른 기기에서 바뀐 서버 기록 흉내)
  if (pathname === '/__mock/planner' && req.method === 'GET') {
    const userId = mockUserId(url.searchParams.get('sub') ?? '');
    return send(res, 200, { userId, records: [...plannerOf(userId).values()], commitRequests: state.commitRequests });
  }
  if (pathname === '/__mock/planner' && req.method === 'POST') {
    const body = await readBody(req);
    const records = plannerOf(mockUserId(body.sub));
    for (const { kind, id, data } of body.documents ?? []) {
      const previous = records.get(`${kind}:${id}`);
      records.set(`${kind}:${id}`, {
        kind, id, schemaVersion: 1, version: (previous?.version ?? 0) + 1, deleted: data === null, data, updatedAt: new Date().toISOString(),
      });
    }
    return send(res, 200, { records: [...records.values()] });
  }
  if (pathname === '/__mock/expire-sessions' && req.method === 'POST') {
    state.sessions.clear();
    return send(res, 200, { ok: true });
  }
  if (pathname === '/__mock/stats') {
    const authenticatedSessions = [...state.sessions.values()].filter((session) => session.user).length;
    return send(res, 200, { ...state.stats, sessions: authenticatedSessions, lastAiRequest: state.lastAiRequest });
  }

  // ---- Spring Security OAuth2 로그인 흉내 ----
  if (pathname === '/oauth2/authorization/google' && req.method === 'GET') {
    return send(res, 302, undefined, { location: '/login/oauth2/code/google?code=mock-code&state=mock-state' });
  }
  if (pathname === '/login/oauth2/code/google' && req.method === 'GET') {
    if (state.loginMode !== 'ok') {
      return send(res, 302, undefined, { location: `/?authError=${state.loginMode}` });
    }
    // Spring처럼 로그인 시 세션 id를 바꾼다(session fixation 방지). 이전 세션의 CSRF 토큰은 무효가 된다.
    const previous = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (previous) state.sessions.delete(previous);
    const sid = crypto.randomBytes(16).toString('hex');
    state.sessions.set(sid, { user: state.nextUser, csrf: crypto.randomUUID() });
    return send(res, 302, undefined, {
      location: '/',
      'set-cookie': `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax`,
    });
  }

  // ---- 인증 API ----
  if (pathname === '/api/v1/me' && req.method === 'GET') {
    state.stats.meCalls += 1;
    if (state.meMode === 'down') {
      req.socket.destroy();
      return undefined;
    }
    if (state.meMode === 'error') return send(res, 500, { error: 'internal' });
    if (state.meMode === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, SLOW_RESPONSE_MS));
    }
    if (state.meMode === 'invalid') return send(res, 200, { hello: 'not-a-user' });

    const session = currentSession(req);
    if (!session?.user) return send(res, 401, { authenticated: false });
    const { sub, email, name } = session.user;
    const storageEnabled = state.storageMode !== 'disabled';
    return send(res, 200, {
      authenticated: true,
      storageEnabled,
      user: { authProvider: 'google', externalSubject: sub, name, email, image: null, ...(storageEnabled ? { userId: mockUserId(sub) } : {}) },
    });
  }

  if (pathname === '/api/v1/planner' || pathname === '/api/v1/planner/commit') {
    const session = currentSession(req);
    if (!session?.user) return send(res, 401, { authenticated: false });
    if (state.storageMode === 'disabled') return send(res, 503, { error: 'storage_disabled' });
    if (state.storageMode === 'error') return send(res, 503, { error: 'storage_unavailable' });
    const userId = mockUserId(session.user.sub);
    if (req.headers['x-plannet-user-id'] !== userId) return send(res, 409, { error: 'account_changed' });
    const records = plannerOf(userId);
    if (pathname === '/api/v1/planner' && req.method === 'GET') {
      state.stats.plannerReads += 1;
      return send(res, 200, { userId, records: [...records.values()] });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    if (req.headers[CSRF_HEADER_NAME.toLowerCase()] !== session.csrf) return send(res, 403, { error: 'csrf_invalid' });
    const body = await readBody(req);
    state.commitRequests.push(body.requestId);
    const receiptKey = `${userId}:${body.requestId}`;
    const receipt = state.receipts.get(receiptKey);
    if (receipt) {
      return receipt.body === canonical(body) ? send(res, 200, { records: receipt.records }) : send(res, 409, { error: 'idempotency_conflict' });
    }
    const conflicts = body.changes.filter((change) => (records.get(`${change.kind}:${change.id}`)?.version ?? 0) !== change.expectedVersion);
    if (conflicts.length) return send(res, 409, { error: 'version_conflict', conflicts: conflicts.map((change) => `${change.kind}:${change.id}`) });
    const saved = body.changes.map((change) => ({
      kind: change.kind, id: change.id, schemaVersion: 1, version: change.expectedVersion + 1,
      deleted: change.data === null, data: change.data, updatedAt: new Date().toISOString(),
    }));
    saved.forEach((record) => records.set(`${record.kind}:${record.id}`, record));
    state.receipts.set(receiptKey, { body: canonical(body), records: saved });
    state.stats.commits += 1;
    return send(res, 200, { records: saved });
  }

  if (pathname === '/api/v1/csrf' && req.method === 'GET') {
    let sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    let session = sid ? state.sessions.get(sid) : undefined;
    const headers = {};
    if (!session) {
      // Spring HttpSessionCsrfTokenRepository처럼 익명 세션을 만들어 토큰을 묶는다.
      sid = crypto.randomBytes(16).toString('hex');
      session = { user: null, csrf: crypto.randomUUID() };
      state.sessions.set(sid, session);
      headers['set-cookie'] = `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax`;
    }
    return send(res, 200, { headerName: CSRF_HEADER_NAME, token: session.csrf }, headers);
  }

  if (pathname === '/api/v1/logout' && req.method === 'POST') {
    state.stats.logoutCalls += 1;
    const session = currentSession(req);
    const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()];
    if (!session || !headerToken || headerToken !== session.csrf) {
      state.stats.logoutRejected += 1;
      return send(res, 403, { error: 'csrf_invalid' });
    }
    state.sessions.delete(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    return send(res, 204, undefined, {
      'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    });
  }

  // ---- 모의 AI ----
  if (pathname === `${MOCK_AI_PATH}/chat/completions` && req.method === 'POST') {
    state.stats.aiCalls += 1;
    const body = await readBody(req);
    state.lastAiRequest = {
      authorization: req.headers.authorization ? 'present' : 'missing',
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      system: body.messages?.[0]?.content?.slice(-400) ?? '',
    };
    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';
    const subGoal = lastUser.slice(0, 20) || '운동';
    const args =
      state.aiMode === 'malformed'
        ? { message: '형식이 잘못된 응답', action: 'generate_actions', subGoal, actions: ['하나', '둘'] }
        : {
            message: `'${subGoal}'의 실천 계획을 만들었어요!\n\n두 번째 하위 목표도 도와드릴까요?`,
            action: 'generate_actions',
            subGoal,
            actions: MOCK_ACTIONS,
          };
    return send(res, 200, toolCallResponse(args));
  }

  return send(res, 404, { error: 'not found', path: pathname });
}

export function startMockAuthApi(port = PORTS.mockApi) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('[mock-api]', error);
      if (!res.headersSent) send(res, 500, { error: 'mock failure' });
    });
  });
  return new Promise((resolve) => server.listen(port, HOST, () => resolve(server)));
}
