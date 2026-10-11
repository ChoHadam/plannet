'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AUTH_PATHS,
  AuthUser,
  classifyMeStatus,
  CSRF_INVALID_ERROR,
  DEFAULT_LOGIN_ERROR_MESSAGE,
  LOGIN_ERROR_MESSAGES,
  LOGIN_ERROR_QUERY,
  LOGOUT_SUCCESS_STATUS,
  parseMeBody,
} from '@/lib/authContract';
import { LOCAL_STORAGE_SCOPE, serverMemoryScope } from '@/lib/plannerStorage';
import { getPlannerSync } from '@/lib/plannerSyncInstance';
import { parseRuntimeConfig, PENDING_RUNTIME_CONFIG, RUNTIME_CONFIG_PATH, RUNTIME_CONFIG_TIMEOUT_MS, RuntimeConfig } from '@/lib/runtimeConfig';

/**
 * 로그인 상태는 Spring(`/api/v1/me`)만 판단한다. Web은 세션을 만들거나 저장하지 않는다.
 * 인증 on/off는 빌드 결과가 아니라 요청 시점의 서버 설정(/api/runtime-config)을 따른다.
 * 플래너 입장(admitted)은 'authenticated'와 명시적 인증 꺼짐 'disabled'뿐이다. 나머지 상태에는 저장 범위가 없다.
 */

export type AuthStatus = 'loading' | 'disabled' | 'anonymous' | 'authenticated' | 'unavailable';

/**
 * - ok: 저장을 모두 마치고 로그아웃했다 (랜딩으로 이동)
 * - unsaved: 저장하지 못한 수정이 있어 로그아웃하지 않았다 (작업 공간·메모리 그대로)
 * - failed: CSRF·로그아웃 요청이 실패했다 (세션·작업 공간 그대로)
 * - edited: 로그아웃 요청 중에 새 수정이 생겼다. 세션은 끝났으므로 파일 저장만 가능하다
 */
export type LogoutResult = 'ok' | 'unsaved' | 'failed' | 'edited';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  config: RuntimeConfig;
  /**
   * 플래너 저장 범위. 로그인+서버 저장이면 메모리 범위(`server:<UUID>`, 브라우저 저장 없음),
   * 명시적 인증 꺼짐이면 LOCAL. 그 밖(확인 중·미로그인·확인 실패·서버 저장이 없는 로그인)에는 null
   */
  storageScope: string | null;
  storageEnabled: boolean;
  /** 로그인 실패 후 돌아왔을 때 보여줄 안내 (`?authError=`) */
  loginError: string | null;
  login: () => void;
  logout: () => Promise<LogoutResult>;
  retry: () => void;
}

const ME_TIMEOUT_MS = 5000;
/** csrf_invalid(세션이 바뀐 경우 등)일 때 토큰을 새로 받아 한 번만 더 시도한다. */
const LOGOUT_ATTEMPTS = 2;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

/** 설정을 받지 못하거나 형식이 어긋나면 null. 호출부는 이를 인증 꺼짐이 아니라 확인 실패로 다룬다. */
async function fetchRuntimeConfig(): Promise<RuntimeConfig | null> {
  try {
    const response = await fetch(RUNTIME_CONFIG_PATH, { cache: 'no-store', signal: AbortSignal.timeout(RUNTIME_CONFIG_TIMEOUT_MS) });
    if (!response.ok) return null;
    return parseRuntimeConfig(await response.json());
  } catch {
    return null;
  }
}

type MeResult = { status: 'authenticated'; user: AuthUser; storageEnabled: boolean } | { status: 'anonymous' | 'unavailable' };

async function fetchMe(): Promise<MeResult> {
  let response: Response;
  try {
    response = await fetch(AUTH_PATHS.me, {
      credentials: 'same-origin',
      cache: 'no-store',
      // Spring이 로그인 페이지로 redirect하면 따라가지 않고 미인증으로 본다.
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(ME_TIMEOUT_MS),
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.type === 'opaqueredirect') return { status: 'anonymous' };
  const verdict = classifyMeStatus(response.status);
  if (verdict === 'unauthenticated') return { status: 'anonymous' };
  if (verdict === 'unavailable') return { status: 'unavailable' };

  try {
    const parsed = parseMeBody(await response.json());
    if (parsed.kind === 'authenticated') return { status: 'authenticated', user: parsed.user, storageEnabled: parsed.storageEnabled };
    if (parsed.kind === 'unauthenticated') return { status: 'anonymous' };
  } catch {
    // JSON이 아니면 계약 불일치
  }
  return { status: 'unavailable' };
}

interface CsrfToken {
  headerName: string;
  token: string;
}

/** 계약: GET /api/v1/csrf → { headerName, token }. 헤더 이름은 하드코딩하지 않고 응답 값을 쓴다. */
async function fetchCsrfToken(): Promise<CsrfToken | null> {
  try {
    const response = await fetch(AUTH_PATHS.csrf, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<CsrfToken>;
    if (typeof body.headerName !== 'string' || !HEADER_NAME_PATTERN.test(body.headerName)) return null;
    if (typeof body.token !== 'string' || !body.token) return null;
    return { headerName: body.headerName, token: body.token };
  } catch {
    return null;
  }
}

async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = (await response.json()) as { error?: unknown };
    return body.error === CSRF_INVALID_ERROR;
  } catch {
    return false;
  }
}

/** 로그인 실패 쿼리를 읽고 주소창에서 지운다 (새로고침 시 다시 표시되지 않게). */
function consumeLoginError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get(LOGIN_ERROR_QUERY);
  if (code === null) return null;
  url.searchParams.delete(LOGIN_ERROR_QUERY);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return LOGIN_ERROR_MESSAGES[code] ?? DEFAULT_LOGIN_ERROR_MESSAGE;
}

interface ResolvedState {
  status: Exclude<AuthStatus, 'loading'>;
  user: AuthUser | null;
  config: RuntimeConfig;
  storageEnabled: boolean;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [resolved, setResolved] = useState<ResolvedState | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 쿼리는 한 번만 읽고 지운다. effect가 다시 실행돼도(라우터 동기화 등) 이미 받은 안내를 null로 덮지 않는다.
    const loginErrorMessage = consumeLoginError();
    if (loginErrorMessage) setLoginError(loginErrorMessage);

    (async () => {
      const config = await fetchRuntimeConfig();
      if (!config) {
        if (!cancelled) setResolved({ status: 'unavailable', user: null, config: PENDING_RUNTIME_CONFIG, storageEnabled: false });
        return;
      }
      if (!config.authEnabled) {
        if (!cancelled) setResolved({ status: 'disabled', user: null, config, storageEnabled: false });
        return;
      }
      const me = await fetchMe();
      if (cancelled) return;
      setResolved({ status: me.status, user: me.status === 'authenticated' ? me.user : null, config, storageEnabled: me.status === 'authenticated' && me.storageEnabled });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    window.location.assign(AUTH_PATHS.googleLogin);
  }, []);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    // 저장 전 수정은 이 탭 메모리에만 있다. 서버 응답으로 모두 확인된 뒤에만 세션을 끝낸다.
    const sync = getPlannerSync();
    // An initial DB read failure has no edits to lose and must not trap the user in the session.
    if (sync?.isDirty() && !(await sync.settle())) return 'unsaved';
    for (let attempt = 0; attempt < LOGOUT_ATTEMPTS; attempt++) {
      // 토큰은 세션에 묶인다. 로그인 후 세션 id가 바뀌므로 매번 새로 받는다.
      const csrf = await fetchCsrfToken();
      if (!csrf) return 'failed';

      let response: Response;
      try {
        response = await fetch(AUTH_PATHS.logout, {
          method: 'POST',
          credentials: 'same-origin',
          redirect: 'manual',
          headers: { [csrf.headerName]: csrf.token },
        });
      } catch {
        return 'failed';
      }

      if (response.status === LOGOUT_SUCCESS_STATUS) {
        // 요청 중 생긴 수정은 보낼 세션이 없다. 이동하지 않고 파일 저장을 안내한다.
        if (sync?.isDirty()) return 'edited';
        sync?.stop();
        // 메모리에 남은 계정 데이터를 비우기 위해 새로 불러온다. replace: 뒤로 가기로 로그인 중 화면 기록에 돌아가지 않게 한다.
        window.location.replace('/');
        return 'ok';
      }
      if (!(await isCsrfRejection(response))) return 'failed';
    }
    return 'failed';
  }, []);

  // 저장 범위가 바뀔 수 있으므로 상태만 다시 받지 않고 페이지를 새로 불러온다.
  const retry = useCallback(() => {
    window.location.reload();
  }, []);

  // 뒤로/앞으로 가기로 메모리에 보관된 페이지(bfcache)가 되살아나면 로그인 상태를 다시 확인한다.
  useEffect(() => {
    const revalidate = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', revalidate);
    return () => window.removeEventListener('pageshow', revalidate);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    if (!resolved) {
      return {
        status: 'loading',
        user: null,
        config: PENDING_RUNTIME_CONFIG,
        storageScope: null,
        storageEnabled: false,
        loginError,
        login,
        logout,
        retry,
      };
    }
    // 로그인한 서비스는 서버 저장만 쓴다. 서버 저장이 없으면 계정 LocalStorage로 대체하지 않고 범위를 열지 않는다.
    const storageScope = resolved.status === 'authenticated'
      ? resolved.storageEnabled && resolved.user?.userId ? serverMemoryScope(resolved.user.userId) : null
      : resolved.status === 'disabled' ? LOCAL_STORAGE_SCOPE : null;
    return { ...resolved, storageScope, loginError, login, logout, retry };
  }, [resolved, loginError, login, logout, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
