'use client';

import { useState } from 'react';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { getCurrentWeeklyFocus } from '@/lib/weekUtils';

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// 새로고침 아이콘 컴포넌트
function SyncButton({ isRefreshing, onClick }: { isRefreshing: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded hover:bg-white/50 transition-colors"
      title="새로고침"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-current ${isRefreshing ? 'animate-spin' : ''}`}
      >
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
      </svg>
    </button>
  );
}

export function WeeklyFocusRef() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);
  const { focus, monthlyPlan, weekNumber } = getCurrentWeeklyFocus(monthlyPlans);

  const handleSync = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const monthName = MONTH_NAMES[currentMonth - 1];

  // 해당 월의 월간 플래너가 없는 경우
  if (!monthlyPlan) {
    return (
      <div className="w-48 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-400"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-xs font-semibold text-slate-500">
              주간 포커스
            </span>
          </div>
          <SyncButton isRefreshing={isRefreshing} onClick={handleSync} />
        </div>
        <p className="text-xs text-slate-400">
          {monthName} 월간 플래너가 없습니다
        </p>
      </div>
    );
  }

  // 월간 플래너는 있지만 주간 포커스가 비어있는 경우
  if (!focus?.text) {
    return (
      <div className="w-48 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-400"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-xs font-semibold text-slate-500">
              주간 포커스
            </span>
          </div>
          <SyncButton isRefreshing={isRefreshing} onClick={handleSync} />
        </div>
        <p className="text-xs text-slate-400">
          {monthName} W{weekNumber} 포커스 미설정
        </p>
      </div>
    );
  }

  const planMonthName = MONTH_NAMES[monthlyPlan.month - 1];

  return (
    <div className="w-48 flex-shrink-0 bg-indigo-50 rounded-xl border border-indigo-200 p-3 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-500"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span className="text-xs font-semibold text-indigo-700">
            이번 주 포커스
          </span>
        </div>
        <SyncButton isRefreshing={isRefreshing} onClick={handleSync} />
      </div>

      {/* Focus Text */}
      <p className="text-sm text-slate-600 leading-snug mb-2">
        {focus.text}
      </p>

      {/* Source Info */}
      <p className="text-xs text-indigo-400">
        {planMonthName} W{weekNumber} · {monthlyPlan.title || '월간 플래너'}
      </p>
    </div>
  );
}
