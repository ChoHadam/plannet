'use client';

import { useState, useEffect } from 'react';
import { useMonthlyStore } from '@/hooks/useMonthly';

interface MemoSectionProps {
  memo: string;
}

export function MemoSection({ memo }: MemoSectionProps) {
  const updateMemo = useMonthlyStore((state) => state.updateMemo);
  const [localMemo, setLocalMemo] = useState(memo);

  // Sync with prop
  useEffect(() => {
    setLocalMemo(memo);
  }, [memo]);

  // Debounced save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localMemo !== memo) {
        updateMemo(localMemo);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localMemo, memo, updateMemo]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        메모
      </h3>

      <textarea
        value={localMemo}
        onChange={(e) => setLocalMemo(e.target.value)}
        placeholder="자유롭게 메모하세요..."
        className="w-full h-24 text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white"
      />
    </div>
  );
}
