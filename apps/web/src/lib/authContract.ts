/**
 * Spring 인증 서버(apps/api)와 Web이 공유하는 계약.
 * 클라이언트·서버 양쪽에서 import한다. 비밀값이나 서버 전용 주소를 두지 않는다.
 *
 * 계약 원문: docs/contracts/auth-v1.md · Web 연동: docs/web-auth-integration.md
 */

/** 브라우저가 같은 origin으로 호출하는 Spring 경로 (Ingress가 API로 라우팅) */
export const AUTH_PATHS = {
  /** Spring Security 기본 OAuth2 로그인 시작 경로 */
  googleLogin: '/oauth2/authorization/google',
  me: '/api/v1/me',
  /** 세션에 묶인 CSRF 토큰 발급: 200 { headerName, token } */
  csrf: '/api/v1/csrf',
  logout: '/api/v1/logout',
} as const;

/** Spring 세션 쿠키 (HttpOnly, SameSite=Lax, Path=/) */
export const SESSION_COOKIE_NAME = 'PLANNET_SESSION';

/** 로그아웃 성공 응답 (공유 계약) */
export const LOGOUT_SUCCESS_STATUS = 204;

/** CSRF 누락·불일치 시 403 본문의 error 값. 토큰을 다시 받아 한 번 재시도한다. */
export const CSRF_INVALID_ERROR = 'csrf_invalid';

/** 로그인 실패 시 Spring이 붙이는 쿼리 (`/?authError=<code>`) */
export const LOGIN_ERROR_QUERY = 'authError';
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  login_failed: '로그인하지 못했어요. 다시 시도해주세요.',
  auth_unavailable: '지금은 로그인을 사용할 수 없어요.',
};
export const DEFAULT_LOGIN_ERROR_MESSAGE = LOGIN_ERROR_MESSAGES.login_failed;

export interface AuthUser {
  /** provider 내 고유 식별자 (계약의 externalSubject = Google `sub`). 내부 userId가 아니다. */
  subject: string;
  provider: string;
  email?: string;
  name?: string;
  image?: string;
}

/** `/api/v1/me` 응답을 해석한 결과 */
export type MeParseResult =
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'unauthenticated' }
  | { kind: 'invalid' };

const DEFAULT_PROVIDER = 'google';
const MAX_PROFILE_FIELD_LENGTH = 320;

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed.length <= MAX_PROFILE_FIELD_LENGTH) return trimmed;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 200 응답 본문을 사용자 정보로 해석한다.
 * 계약: `{ authenticated: true, user: { authProvider, externalSubject, name, email, image } }`
 * (name·email·image는 null 가능). 모르는 필드는 무시한다.
 * 식별자를 찾지 못하면 계약 불일치(invalid)로 보고 인증을 인정하지 않는다.
 */
export function parseMeBody(body: unknown): MeParseResult {
  if (!isRecord(body)) return { kind: 'invalid' };
  if (body.authenticated === false) return { kind: 'unauthenticated' };
  if (body.authenticated !== true || !isRecord(body.user)) return { kind: 'invalid' };

  const source = body.user;
  const subject = readString(source, 'externalSubject');
  if (!subject) return { kind: 'invalid' };

  return {
    kind: 'authenticated',
    user: {
      subject,
      provider: readString(source, 'authProvider') ?? DEFAULT_PROVIDER,
      email: readString(source, 'email'),
      name: readString(source, 'name'),
      image: readString(source, 'image'),
    },
  };
}

/** HTTP 상태 코드로 먼저 판정한다. 200일 때만 본문을 본다. */
export function classifyMeStatus(status: number): 'parse-body' | 'unauthenticated' | 'unavailable' {
  if (status === 200) return 'parse-body';
  // 401/403은 미인증. 계약상 /api/v1/**는 redirect하지 않지만, 3xx가 오면 로그인 페이지로 보내려는 것으로 보고 미인증 처리한다.
  if (status === 401 || status === 403 || (status >= 300 && status < 400)) return 'unauthenticated';
  return 'unavailable';
}

/** 사용자 식별 키. provider와 subject 조합이 계정을 구분한다. */
export function authUserKey(user: Pick<AuthUser, 'provider' | 'subject'>): string {
  return `${user.provider}:${user.subject}`;
}
