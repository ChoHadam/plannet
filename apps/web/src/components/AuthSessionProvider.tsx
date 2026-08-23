'use client';

import { createContext, useContext } from 'react';
import { SessionProvider } from 'next-auth/react';

/**
 * 인증 기능 on/off 상태를 클라이언트 트리에 전달한다.
 * 서버에서 읽은 AUTH_ENABLED 값이 layout을 통해 여기로 들어온다.
 */
const AuthEnabledContext = createContext(false);

export function useAuthEnabled(): boolean {
  return useContext(AuthEnabledContext);
}

interface AuthSessionProviderProps {
  enabled: boolean;
  children: React.ReactNode;
}

export function AuthSessionProvider({ enabled, children }: AuthSessionProviderProps) {
  // 꺼져 있으면 SessionProvider를 아예 마운트하지 않는다.
  // 마운트되면 매 페이지 로드마다 /api/auth/session 을 호출하기 때문이다.
  if (!enabled) {
    return <AuthEnabledContext.Provider value={false}>{children}</AuthEnabledContext.Provider>;
  }

  return (
    <AuthEnabledContext.Provider value={true}>
      <SessionProvider>{children}</SessionProvider>
    </AuthEnabledContext.Provider>
  );
}
