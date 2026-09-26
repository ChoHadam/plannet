'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { hasLocalScopeData } from '@/lib/plannerStorage';

const PILL_CLASS =
  'rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60';

export function AuthStatus() {
  const { status } = useAuth();

  if (status === 'loading' || status === 'disabled') return null;
  if (status === 'unavailable') return <AuthUnavailable />;
  if (status === 'authenticated') return <SignedIn />;
  return <SignedOut />;
}

function SignedOut() {
  const { login, loginError } = useAuth();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={login} className={PILL_CLASS}>
        Google 로그인
      </button>
      {loginError && (
        <p role="alert" className="text-xs text-red-600">
          {loginError}
        </p>
      )}
    </div>
  );
}

function AuthUnavailable() {
  const { retry } = useAuth();
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-amber-700">
      <span>로그인 상태를 확인할 수 없어요. 로그인 전 로컬 데이터를 표시합니다.</span>
      <button type="button" onClick={retry} className={PILL_CLASS}>
        다시 시도
      </button>
    </div>
  );
}

function SignedIn() {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // 로그인 전 공통 데이터는 계정에 귀속하지 않고 LOCAL 범위에 남겨 둔다.
  const [hasLocalData] = useState(() => hasLocalScopeData());

  const displayName = user?.name || user?.email || '사용자';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'P';

  const handleLogout = async () => {
    setPending(true);
    setFailed(false);
    const ok = await logout();
    if (!ok) {
      setPending(false);
      setFailed(true);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-2 py-1 shadow-sm backdrop-blur">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {initial}
        </div>
        <div className="hidden max-w-40 truncate text-sm font-medium text-slate-600 sm:block">{displayName}</div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={pending}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-60"
        >
          로그아웃
        </button>
      </div>
      {failed && (
        <p role="alert" className="text-xs text-red-600">
          로그아웃하지 못했어요. 다시 시도해주세요.
        </p>
      )}
      {hasLocalData && (
        <p className="text-xs text-slate-500">
          로그인 전에 이 브라우저에 저장한 플랜은 계정과 분리해 보존했어요. 로그아웃하면 다시 볼 수 있어요.
        </p>
      )}
    </div>
  );
}
