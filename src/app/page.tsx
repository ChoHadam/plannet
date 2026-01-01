'use client';

import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { MandalartGrid } from '@/components/Mandalart';
import { useHydration } from '@/hooks/useMandalart';

export default function Home() {
  const hydrated = useHydration();

  if (!hydrated) {
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
        <Header />
        <MandalartGrid />

        <footer className="mt-8 text-center text-sm text-slate-400">
          <p>구역을 클릭하여 색상을 변경할 수 있습니다</p>
        </footer>
      </main>
    </div>
  );
}
