'use client';

import { useState } from 'react';
import { LogoutResult, useAuth } from '@/components/AuthProvider';

/** 플래너 안의 로그인 상태 표시. 미로그인·확인 중·확인 실패 화면은 Landing이 맡는다. */
export function AuthStatus() {
  const { status } = useAuth();
  return status === 'authenticated' ? <SignedIn /> : null;
}

const LOGOUT_FAILURES: Record<Exclude<LogoutResult, 'ok'>, string> = {
  unsaved: '저장되지 않은 수정이 있어 로그아웃하지 않았어요. 서버 저장을 다시 시도하거나 초안을 파일로 저장해주세요.',
  failed: '로그아웃하지 못했어요. 다시 시도해주세요.',
  edited: '로그아웃하는 동안 생긴 수정은 저장되지 않았어요. 초안을 파일로 저장한 뒤 새로고침해주세요.',
};

function SignedIn() {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const displayName = user?.name || user?.email || '사용자';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'P';

  const handleLogout = async () => {
    setPending(true);
    setFailure(null);
    const result = await logout();
    if (result !== 'ok') {
      setPending(false);
      setFailure(LOGOUT_FAILURES[result]);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-2 py-1 shadow-sm backdrop-blur">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {initial}
        </div>
        <div className="min-w-0 max-w-40 sm:max-w-56">
          <div className="truncate text-sm font-medium text-slate-600">{displayName}</div>
          {user?.email && user.email !== displayName && (
            <div data-testid="auth-account-email" title={user.email} className="truncate text-xs text-slate-500">
              {user.email}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={pending}
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
        >
          로그아웃
        </button>
      </div>
      {failure && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {failure}
        </p>
      )}
    </div>
  );
}
