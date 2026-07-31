'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export function AuthStatus() {
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';
  const user = session?.user;
  const displayName = user?.name || user?.email || '사용자';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'P';

  if (status === 'authenticated' && user) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-2 py-1 shadow-sm backdrop-blur">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {initial}
        </div>
        <div className="hidden max-w-40 truncate text-sm font-medium text-slate-600 sm:block">
          {displayName}
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => signIn('google')}
      className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
    >
      {isLoading ? '확인 중' : 'Google 로그인'}
    </button>
  );
}
