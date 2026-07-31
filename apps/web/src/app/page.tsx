'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { AIChatSidebar } from '@/components/AIChatSidebar';
import { templateRegistry } from '@/lib/templateRegistry';
import { useAllPlansReactive, useAllHydrated } from '@/hooks/useAllPlans';
import { useAutoBackup } from '@/lib/autoBackup';
import { AuthStatus } from '@/components/AuthStatus';

export default function Home() {
  const allHydrated = useAllHydrated();
  const { currentTemplate } = useAllPlansReactive();
  useAutoBackup();
  const [showAIChat, setShowAIChat] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 모바일에서는 기본적으로 사이드바 닫힌 상태로 시작 (첫 마운트 1회만)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  if (!allHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen md:min-w-[1024px]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 py-4 px-3 md:py-8 md:px-4 overflow-x-auto min-w-0">
        <div className="w-full max-w-4xl mx-auto px-4 pl-14 md:pl-4 flex justify-end">
          <AuthStatus />
        </div>

        <Header onOpenAIChat={() => setShowAIChat(true)} />

        {currentTemplate ? (
          (() => {
            const Grid = templateRegistry[currentTemplate].GridComponent;
            return <Grid />;
          })()
        ) : (
          <div className="flex items-center justify-center h-96 text-slate-400">
            <div className="text-center">
              <p className="mb-2">플랜을 선택하거나 새로 만들어주세요</p>
              <p className="text-sm">사이드바에서 카테고리별 + 버튼을 클릭하세요</p>
            </div>
          </div>
        )}
      </main>

      <AIChatSidebar
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
      />
    </div>
  );
}
