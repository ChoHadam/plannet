'use client';

import { useMonthlyStore } from '@/hooks/useMonthly';
import { CompactCalendar } from './CompactCalendar';
import { MonthlyGoals } from './MonthlyGoals';
import { WeeklyFocus } from './WeeklyFocus';
import { MemoSection } from './MemoSection';

const MONTH_NAMES = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

export function MonthlyGrid() {
  const currentMonthlyId = useMonthlyStore((state) => state.currentMonthlyId);
  const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);
  const data = monthlyPlans.find((p) => p.id === currentMonthlyId) || null;
  const navigateMonth = useMonthlyStore((state) => state.navigateMonth);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400">
        월간 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const monthName = MONTH_NAMES[data.month - 1];

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      {/* Header with month navigation */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          title="이전 달"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-slate-700">
          {data.year}년 {monthName}
        </h2>
        <button
          onClick={() => navigateMonth('next')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          title="다음 달"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      {/* Main layout: Calendar (30%) + Dashboard (70%) */}
      <div className="flex gap-6">
        {/* Left: Compact Calendar */}
        <div className="w-[30%] min-w-[280px]">
          <CompactCalendar
            year={data.year}
            month={data.month}
            weeklyFocus={data.weeklyFocus}
          />
        </div>

        {/* Right: Dashboard */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Monthly Goals */}
          <MonthlyGoals goals={data.goals} />

          {/* Weekly Focus */}
          <WeeklyFocus weeklyFocus={data.weeklyFocus} />

          {/* Memo */}
          <MemoSection memo={data.memo} />
        </div>
      </div>
    </div>
  );
}
