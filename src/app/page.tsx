'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { AIChatSidebar } from '@/components/AIChatSidebar';
import { templateRegistry } from '@/lib/templateRegistry';
import { useAllPlansReactive, useAllHydrated } from '@/hooks/useAllPlans';

export default function Home() {
  const allHydrated = useAllHydrated();
  const { currentTemplate } = useAllPlansReactive();
  const [showAIChat, setShowAIChat] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!allHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-w-[1024px]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 py-8 px-4 overflow-x-auto">
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

        <footer className="mt-8 text-center text-sm text-slate-400">
          {currentTemplate && <p>{templateRegistry[currentTemplate].footerHint}</p>}
        </footer>
      </main>

      <AIChatSidebar
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
      />
    </div>
  );
}
