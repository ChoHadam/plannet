'use client';

import { ComponentProps, useEffect, useState } from 'react';
import type * as AIChatSidebarModule from '@/components/AIChatSidebar';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { lazyComponent } from '@/lib/lazyComponent';
import { templateRegistry } from '@/lib/templateRegistry';
import { useAllPlansReactive, useAllHydrated } from '@/hooks/useAllPlans';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { useAutoBackup } from '@/lib/autoBackup';
import { AuthStatus } from '@/components/AuthStatus';
import { useAuth } from '@/components/AuthProvider';
import { PlannerSyncStatus } from '@/components/PlannerSyncStatus';
import { usePlannerSyncStatus } from '@/hooks/usePlannerSync';
import { isMobileViewport } from '@/lib/constants';
import { usePlanSelectionUrl } from '@/hooks/usePlanSelectionUrl';
import { parsePlanSelection } from '@/lib/planSelectionUrl';
import { WorkspaceHome } from '@/components/WorkspaceHome';
import { WorkspaceLoading } from '@/components/WorkspaceLoading';
import { LazyLoadDialog } from '@/components/LazyLoadDialog';
import { useKeyboardInset } from '@/lib/visualViewport';

// AI 도우미는 처음 열 때 받는다. 한 번 연 뒤에는 대화가 유지되도록 계속 마운트한다.
// 받는 동안·실패 시에는 열려 있을 때만 닫기·다시 시도 대화상자를 보인다(닫은 뒤 도착해도 열리지 않는다).
type AIChatProps = ComponentProps<typeof AIChatSidebarModule.AIChatSidebar>;
const AIChatSidebar = lazyComponent(
  () => import('@/components/AIChatSidebar').then((m) => m.AIChatSidebar),
  ({ isOpen, onClose }: AIChatProps) => isOpen && <LazyLoadDialog title="AI 어시스턴트" onClose={onClose} />,
  ({ isOpen, onClose }: AIChatProps, retry) => isOpen && <LazyLoadDialog title="AI 어시스턴트" onClose={onClose} onRetry={retry} />,
);

/**
 * 플래너 작업 공간. 로그인 확인(또는 명시적 인증 꺼짐)이 끝난 뒤에만 마운트된다.
 * 이 컴포넌트가 마운트될 때 store 복원(usePlannerStorageHydration)과 자동 백업이 시작된다.
 * 서버 저장 모드에서는 첫 DB 조회가 끝나기 전에는 편집 화면을 열지 않는다(빈 화면 편집이 서버 기록을 덮지 않게).
 */
export function PlannerWorkspace() {
  const allHydrated = useAllHydrated();
  const { allPlans, currentTemplate } = useAllPlansReactive();
  const viewedMonth = useMonthlyStore((state) => state.viewedMonth);
  const viewedDay = useDailyStore((state) => state.viewedDay);
  const displayedTemplate = currentTemplate ?? (viewedMonth ? 'monthly' : viewedDay ? 'daily' : null);
  const { config, storageEnabled, storageScope } = useAuth();
  const sync = usePlannerSyncStatus();
  const ready = allHydrated && (!storageEnabled || sync.loaded);
  // 주소의 플랜 선택은 이 계정의 기록을 모두 불러온 뒤에만 읽는다.
  const { notice } = usePlanSelectionUrl(ready, storageScope);
  useAutoBackup(config.backupEnabled);
  // 고정 패널·모달이 화상 키보드 위에 오도록 가려진 높이만 CSS 변수로 갱신한다.
  useKeyboardInset();
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiChatUsed, setAIChatUsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 주소에 적힌 템플릿의 편집기 코드만 첫 DB 조회와 나란히 받는다. 선택 자체는 여전히 조회 뒤 usePlanSelectionUrl이 정한다.
  useEffect(() => {
    const parsed = parsePlanSelection(window.location.search);
    if (parsed.kind === 'plan') templateRegistry[parsed.selection.template].GridComponent.preload().catch(() => {});
  }, []);

  // 모바일에서는 기본적으로 사이드바 닫힌 상태로 시작 (첫 마운트 1회만)
  useEffect(() => {
    if (isMobileViewport()) {
      setSidebarCollapsed(true);
    }
  }, []);

  if (!ready) {
    return (
      <WorkspaceLoading>
        <PlannerSyncStatus />
      </WorkspaceLoading>
    );
  }

  return (
    <div className="flex min-h-app">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 py-4 px-3 md:py-8 md:px-4 overflow-x-auto min-w-0">
        <div className="w-full max-w-4xl mx-auto px-4 pl-14 md:pl-4 flex flex-col items-end gap-2">
          <AuthStatus />
          <PlannerSyncStatus />
        </div>

        <Header onOpenAIChat={() => { setAIChatUsed(true); setShowAIChat(true); }} />

        {displayedTemplate ? (
          (() => {
            const Grid = templateRegistry[displayedTemplate].GridComponent;
            return <Grid />;
          })()
        ) : (
          <WorkspaceHome plans={allPlans} notice={notice} />
        )}
      </main>

      {aiChatUsed && (
        <AIChatSidebar
          isOpen={showAIChat}
          onClose={() => setShowAIChat(false)}
        />
      )}
    </div>
  );
}
