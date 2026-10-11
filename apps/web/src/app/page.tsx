'use client';

import { useAuth } from '@/components/AuthProvider';
import { Landing } from '@/components/Landing';
import { WorkspaceLoading } from '@/components/WorkspaceLoading';
import { lazyComponent } from '@/lib/lazyComponent';

// 로그인 전 화면은 플래너 store·편집기 코드를 받지 않는다. 입장한 뒤에만 작업 공간 묶음을 불러온다.
const PlannerWorkspace = lazyComponent(
  () => import('@/components/PlannerWorkspace').then((m) => m.PlannerWorkspace),
  <WorkspaceLoading />,
  <WorkspaceLoading failed />,
);

/**
 * 입장 게이트. 플래너는 로그인+서버 저장 확인 후(또는 명시적으로 인증을 끈 로컬 모드에서)만 연다.
 * 확인 중·미로그인·확인 실패·서버 저장이 없는 로그인 상태에서는 플래너 store·동기화·백업을 전혀 마운트하지 않는다.
 */
export default function Home() {
  const { status, storageScope } = useAuth();
  if (status === 'disabled' || (status === 'authenticated' && storageScope)) return <PlannerWorkspace />;
  return <Landing />;
}
