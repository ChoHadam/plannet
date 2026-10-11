import 'server-only';
import type { NextRequest } from 'next/server';
import { AUTH_PATHS, AuthUser, classifyMeStatus, parseMeBody, SESSION_COOKIE_NAME } from '@/lib/authContract';
import { isAuthEnabled } from '@/lib/featureFlags';

/**
 * Web 서버가 Spring 인증 서버에 브라우저 세션을 직접 확인한다.
 *
 * - 대상 주소는 서버 전용 환경변수(API_INTERNAL_URL)만 사용한다.
 *   요청 헤더(Host, X-Forwarded-*)나 본문에서 주소를 만들지 않는다.
 * - 브라우저가 보낸 사용자 ID·인증 여부 값은 읽지 않는다. 세션 쿠키 하나만 골라 전달한다.
 *   (계약: docs/contracts/auth-v1.md §4)
 * - 설정 누락·타임아웃·5xx·계약 불일치는 모두 unavailable로 처리해 호출부가 거부하게 한다.
 */

export type SessionCheck =
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated' }
  | { status: 'unavailable'; reason: UnavailableReason }
  | { status: 'disabled' };

export type UnavailableReason =
  | 'not-configured'
  | 'timeout'
  | 'network'
  | 'bad-status'
  | 'invalid-response';

const DEFAULT_TIMEOUT_MS = 2000;
const MAX_TIMEOUT_MS = 10_000;
const MAX_COOKIE_VALUE_LENGTH = 4096;
// RFC 6265 cookie-octet. 헤더 주입을 막기 위해 이 범위 밖의 값은 전달하지 않는다.
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

function getInternalBaseUrl(): URL | null {
  const raw = process.env.API_INTERNAL_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function getSessionCookieName(): string | null {
  const name = process.env.AUTH_SESSION_COOKIE_NAME?.trim() || SESSION_COOKIE_NAME;
  return COOKIE_NAME_PATTERN.test(name) ? name : null;
}

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AUTH_API_TIMEOUT_MS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, MAX_TIMEOUT_MS);
}

export async function verifySession(request: NextRequest): Promise<SessionCheck> {
  if (!isAuthEnabled()) return { status: 'disabled' };

  const baseUrl = getInternalBaseUrl();
  const cookieName = getSessionCookieName();
  if (!baseUrl || !cookieName) return { status: 'unavailable', reason: 'not-configured' };

  const sessionValue = request.cookies.get(cookieName)?.value;
  if (!sessionValue) return { status: 'unauthenticated' };
  if (sessionValue.length > MAX_COOKIE_VALUE_LENGTH || !COOKIE_VALUE_PATTERN.test(sessionValue)) {
    return { status: 'unauthenticated' };
  }

  let response: Response;
  try {
    response = await fetch(new URL(AUTH_PATHS.me, baseUrl), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: `${cookieName}=${sessionValue}`,
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    return { status: 'unavailable', reason: isTimeout ? 'timeout' : 'network' };
  }

  const verdict = classifyMeStatus(response.status);
  if (verdict === 'unauthenticated') return { status: 'unauthenticated' };
  if (verdict === 'unavailable') return { status: 'unavailable', reason: 'bad-status' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'unavailable', reason: 'invalid-response' };
  }

  const parsed = parseMeBody(body);
  if (parsed.kind === 'authenticated') return { status: 'authenticated', user: parsed.user };
  if (parsed.kind === 'unauthenticated') return { status: 'unauthenticated' };
  return { status: 'unavailable', reason: 'invalid-response' };
}
