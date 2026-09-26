'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AUTH_PATHS,
  AuthUser,
  authUserKey,
  classifyMeStatus,
  CSRF_INVALID_ERROR,
  DEFAULT_LOGIN_ERROR_MESSAGE,
  LOGIN_ERROR_MESSAGES,
  LOGIN_ERROR_QUERY,
  LOGOUT_SUCCESS_STATUS,
  parseMeBody,
} from '@/lib/authContract';
import { accountStorageScope, LOCAL_STORAGE_SCOPE } from '@/lib/plannerStorage';
import { FALLBACK_RUNTIME_CONFIG, RUNTIME_CONFIG_PATH, RuntimeConfig } from '@/lib/runtimeConfig';

/**
 * 로그인 상태는 Spring(`/api/v1/me`)만 판단한다. Web은 세션을 만들거나 저장하지 않는다.
 * 인증 on/off는 빌드 결과가 아니라 요청 시점의 서버 설정(/api/runtime-config)을 따른다.
 */

export type AuthStatus = 'loading' | 'disabled' | 'anonymous' | 'authenticated' | 'unavailable';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  config: RuntimeConfig;
  /** 플래너 LocalStorage 범위. 확인이 끝나기 전에는 null */
  storageScope: string | null;
  /** 로그인 실패 후 돌아왔을 때 보여줄 안내 (`?authError=`) */
  loginError: string | null;
  login: () => void;
  logout: () => Promise<boolean>;
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

async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch(RUNTIME_CONFIG_PATH, { cache: 'no-store' });
    if (!response.ok) return FALLBACK_RUNTIME_CONFIG;
    const body = (await response.json()) as Partial<RuntimeConfig>;
    return { authEnabled: body.authEnabled === true, backupEnabled: body.backupEnabled === true };
  } catch {
    return FALLBACK_RUNTIME_CONFIG;
  }
}

type MeResult = { status: 'authenticated'; user: AuthUser } | { status: 'anonymous' | 'unavailable' };

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
    if (parsed.kind === 'authenticated') return { status: 'authenticated', user: parsed.user };
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
      if (!config.authEnabled) {
        if (!cancelled) setResolved({ status: 'disabled', user: null, config });
        return;
      }
      const me = await fetchMe();
      if (cancelled) return;
      setResolved({ status: me.status, user: me.status === 'authenticated' ? me.user : null, config });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    window.location.assign(AUTH_PATHS.googleLogin);
  }, []);

  const logout = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < LOGOUT_ATTEMPTS; attempt++) {
      // 토큰은 세션에 묶인다. 로그인 후 세션 id가 바뀌므로 매번 새로 받는다.
      const csrf = await fetchCsrfToken();
      if (!csrf) return false;

      let response: Response;
      try {
        response = await fetch(AUTH_PATHS.logout, {
          method: 'POST',
          credentials: 'same-origin',
          redirect: 'manual',
          headers: { [csrf.headerName]: csrf.token },
        });
      } catch {
        return false;
      }

      if (response.status === LOGOUT_SUCCESS_STATUS) {
        // 메모리에 남은 계정 데이터를 비우기 위해 새로 불러온다.
        window.location.assign('/');
        return true;
      }
      if (!(await isCsrfRejection(response))) return false;
    }
    return false;
  }, []);

  // 저장 범위가 바뀔 수 있으므로 상태만 다시 받지 않고 페이지를 새로 불러온다.
  const retry = useCallback(() => {
    window.location.reload();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    if (!resolved) {
      return {
        status: 'loading',
        user: null,
        config: FALLBACK_RUNTIME_CONFIG,
        storageScope: null,
        loginError,
        login,
        logout,
        retry,
      };
    }
    const storageScope = resolved.user ? accountStorageScope(authUserKey(resolved.user)) : LOCAL_STORAGE_SCOPE;
    return { ...resolved, storageScope, loginError, login, logout, retry };
  }, [resolved, loginError, login, logout, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
