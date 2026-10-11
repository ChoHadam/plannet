// Test-only OIDC provider. Real Spring validates signed tokens and owns every session.
import crypto from 'node:crypto';
import http from 'node:http';
import { HOST, ISSUER, ORIGIN, PORTS } from './config.mjs';

export const CLIENT_ID = 'storage-e2e-client';
export const CLIENT_SECRET = 'storage-e2e-not-a-real-secret';
const CALLBACK = `${ORIGIN}/login/oauth2/code/google`;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = crypto.randomUUID();
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] };
const grants = new Map();
const tokens = new Map();
const profiles = {
  alice: { sub: 'storage-alice', name: 'Storage Alice', email: 'alice@example.test', email_verified: true },
  bob: { sub: 'storage-bob', name: 'Storage Bob', email: 'bob@example.test', email_verified: true },
};
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const send = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'content-type': typeof value === 'string' ? 'text/html; charset=utf-8' : 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
};
async function form(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}
function sign(profile, nonce) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ ...profile, iss: ISSUER, aud: CLIENT_ID, nonce, iat: now, exp: now + 300 })}`;
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
async function handle(req, res) {
  const url = new URL(req.url, ISSUER);
  if (url.pathname === '/jwks') return send(res, 200, jwks);
  if (url.pathname === '/authorize' && req.method === 'GET') {
    if (url.searchParams.get('client_id') !== CLIENT_ID || url.searchParams.get('redirect_uri') !== CALLBACK || !url.searchParams.get('state')) return send(res, 400, { error: 'invalid_request' });
    const inputs = ['redirect_uri', 'state', 'nonce'].map(key => `<input type="hidden" name="${key}" value="${escape(url.searchParams.get(key) ?? '')}">`).join('');
    return send(res, 200, `<!doctype html><html lang="ko"><meta charset="utf-8"><h1>테스트 OIDC 계정</h1><form method="post" action="/decision">${inputs}<button name="account" value="alice">Alice로 로그인</button><button name="account" value="bob">Bob으로 로그인</button></form></html>`);
  }
  if (url.pathname === '/decision' && req.method === 'POST') {
    const fields = await form(req);
    const profile = profiles[fields.get('account')];
    if (!profile || fields.get('redirect_uri') !== CALLBACK || !fields.get('state')) return send(res, 400, { error: 'invalid_request' });
    const code = crypto.randomUUID();
    grants.set(code, { profile, nonce: fields.get('nonce'), redirect: CALLBACK });
    const redirect = new URL(CALLBACK);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', fields.get('state'));
    return send(res, 302, '', { location: redirect.toString() });
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    const fields = await form(req);
    const auth = req.headers.authorization;
    const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
    const authenticated = auth === expected || (fields.get('client_id') === CLIENT_ID && fields.get('client_secret') === CLIENT_SECRET);
    const code = fields.get('code');
    const grant = grants.get(code);
    grants.delete(code);
    if (!authenticated || !grant || grant.redirect !== fields.get('redirect_uri')) return send(res, 400, { error: 'invalid_grant' });
    const token = crypto.randomUUID();
    tokens.set(token, grant.profile);
    return send(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 300, scope: 'openid profile email', id_token: sign(grant.profile, grant.nonce) });
  }
  if (url.pathname === '/userinfo') {
    const profile = tokens.get(req.headers.authorization?.replace(/^Bearer /, ''));
    return send(res, profile ? 200 : 401, profile ?? { error: 'invalid_token' });
  }
  return send(res, 404, { error: 'not_found' });
}
export async function startOidc() {
  const server = http.createServer((req, res) => { handle(req, res).catch(() => send(res, 500, { error: 'mock_failure' })); });
  await new Promise(resolve => server.listen(PORTS.oidc, HOST, resolve));
  return server;
}
