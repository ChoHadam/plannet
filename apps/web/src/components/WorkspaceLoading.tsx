'use client';

import { ReactNode } from 'react';
import { AuthStatus } from '@/components/AuthStatus';

/** 작업 공간 코드·첫 DB 조회를 기다리는 화면. 계정 표시·로그아웃은 기다리는 동안에도 쓸 수 있다. */
export function WorkspaceLoading({ children, failed = false }: { children?: ReactNode; failed?: boolean }) {
  return (
    <div className="flex min-h-app flex-col items-center justify-center gap-4 px-4">
      <AuthStatus />
      {children}
      <div role="status" className="text-xs text-slate-400">{failed ? '작업 공간을 불러오지 못했어요. 새로고침해주세요.' : '로딩 중...'}</div>
    </div>
  );
}
