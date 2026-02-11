'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { MandalartGrid } from '@/components/Mandalart';
import { Block6Grid } from '@/components/Block6';
import { AIChatSidebar } from '@/components/AIChatSidebar';
import { useHydration, useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Hydration, useBlock6Store } from '@/hooks/useBlock6';

export default function Home() {
  const mandalartHydrated = useHydration();
  const block6Hydrated = useBlock6Hydration();
  const [showAIChat, setShowAIChat] = useState(false);

  // Get current selections from both stores
  const currentMandalartId = useMandalartStore((state) => state.currentId);
  const currentBlock6Id = useBlock6Store((state) => state.currentBlock6Id);

  // Determine which template is currently active
  const currentTemplate = currentMandalartId ? 'mandalart' : currentBlock6Id ? 'block6' : null;

  if (!mandalartHydrated || !block6Hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 py-8 px-4 overflow-auto">
        <Header onOpenAIChat={() => setShowAIChat(true)} />

        {/* Conditional rendering based on current template */}
        {currentTemplate === 'mandalart' && <MandalartGrid />}
        {currentTemplate === 'block6' && <Block6Grid />}
        {!currentTemplate && (
          <div className="flex items-center justify-center h-96 text-slate-400">
            <div className="text-center">
              <p className="mb-2">플랜을 선택하거나 새로 만들어주세요</p>
              <p className="text-sm">사이드바에서 카테고리별 + 버튼을 클릭하세요</p>
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-sm text-slate-400">
          {currentTemplate === 'mandalart' && (
            <p>구역을 클릭하여 색상을 변경할 수 있습니다</p>
          )}
          {currentTemplate === 'block6' && (
            <p>각 블록에 키워드와 할 일을 입력하세요</p>
          )}
        </footer>
      </main>

      {/* AI Chat Sidebar */}
      <AIChatSidebar
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
      />
    </div>
  );
}
