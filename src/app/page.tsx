'use client';

import { Header } from '@/components/Header';
import { MandalartGrid } from '@/components/Mandalart';

export default function Home() {
  return (
    <main className="min-h-screen py-8 px-4">
      <Header />
      <MandalartGrid />

      <footer className="mt-8 text-center text-sm text-slate-400">
        <p>구역을 클릭하여 색상을 변경할 수 있습니다</p>
        <p className="mt-1">데이터는 자동으로 저장됩니다</p>
      </footer>
    </main>
  );
}
