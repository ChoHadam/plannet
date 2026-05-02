'use client';

import { useEffect, useState } from 'react';
import { AutoRestoreResult } from '@/lib/autoBackup';

interface AutoRestoreToastProps {
  result: AutoRestoreResult | null;
}

export function AutoRestoreToast({ result }: AutoRestoreToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!result) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [result]);

  if (!result || !visible) return null;

  const date = new Date(result.createdAt);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

  return (
    <div className="fixed top-4 right-4 z-[100] bg-emerald-50 border border-emerald-200 rounded-xl shadow-lg p-3 flex items-start gap-3 max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex-shrink-0 mt-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-800">
          {result.restoredStores.join(', ')} 자동 복원됨
        </p>
        <p className="text-xs text-emerald-600 mt-0.5">
          {dateStr} {time} 백업으로 되돌렸습니다
        </p>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="flex-shrink-0 text-emerald-400 hover:text-emerald-600 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
