'use client';

import { useMonthlyStore } from '@/hooks/useMonthly';
import { templateRegistry, selectExclusive, TEMPLATE_TYPES } from '@/lib/templateRegistry';
import { getCurrentWeeklyFocus } from '@/lib/weekUtils';
import { MonthlyData, WeeklyFocus } from '@/types/monthly';

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function StarIcon({ className }: { className?: string }) {
  return (
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
      className={className}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

interface WeeklyFocusRefProps {
  planYear?: number;
  planMonth?: number;
  planWeek?: number;
}

export function WeeklyFocusRef({ planYear, planMonth, planWeek }: WeeklyFocusRefProps) {
  const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);

  const now = new Date();

  // Block6 플랜의 year/month/week가 있으면 해당 주를 우선 사용,
  // 없으면 현재 날짜 기준으로 자동 계산
  let monthlyPlan: MonthlyData | null = null;
  let focus: WeeklyFocus | null = null;
  let weekNumber: number;

  if (planYear && planMonth) {
    const matchingPlan = monthlyPlans.find(
      (p) => p.year === planYear && p.month === planMonth
    );
    monthlyPlan = matchingPlan ?? null;
    weekNumber = planWeek ?? 1;
    focus = matchingPlan?.weeklyFocus.find((wf) => wf.weekNumber === weekNumber) ?? null;
  } else {
    const result = getCurrentWeeklyFocus(monthlyPlans, now);
    monthlyPlan = result.monthlyPlan;
    focus = result.focus;
    weekNumber = result.weekNumber;
  }

  const displayMonth = planMonth ?? (now.getMonth() + 1);
  const displayYear = planYear ?? now.getFullYear();
  const monthName = MONTH_NAMES[displayMonth - 1];

  // 해당 월의 월간 플래너 만들기 + 선택
  const handleCreateMonthly = () => {
    // 다른 store 선택 해제
    for (const t of TEMPLATE_TYPES) {
      if (t !== 'monthly') templateRegistry[t].clearSelection();
    }
    templateRegistry.monthly.create('monthly', { year: displayYear, month: displayMonth });
    templateRegistry.monthly.applyTitleAndDate(`${displayYear}.${String(displayMonth).padStart(2, '0')}`, {
      year: displayYear,
      month: displayMonth,
    });
  };

  // 기존 월간 플래너로 이동
  const handleOpenMonthly = () => {
    if (monthlyPlan) {
      selectExclusive('monthly', monthlyPlan.id);
    }
  };

  // 1) 월간 플래너 + 해당 주 포커스가 모두 있는 경우 → 표시
  if (monthlyPlan && focus?.text) {
    const planMonthName = MONTH_NAMES[monthlyPlan.month - 1];
    return (
      <div className="w-48 flex-shrink-0 bg-indigo-50 rounded-xl border border-indigo-200 p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <StarIcon className="text-indigo-500" />
          <span className="text-xs font-semibold text-indigo-700">이번 주 포커스</span>
        </div>
        <p className="text-sm text-slate-600 leading-snug mb-2">{focus.text}</p>
        <p className="text-xs text-indigo-400">
          {planMonthName} W{weekNumber} · {monthlyPlan.title || '월간 플래너'}
        </p>
      </div>
    );
  }

  // 2) 월간 플래너는 있지만 포커스 미설정 → 월간 플래너로 이동 유도
  if (monthlyPlan) {
    return (
      <div className="w-48 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <StarIcon className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">이번 주 포커스</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          {monthName} W{weekNumber} 포커스가 비어있어요
        </p>
        <button
          onClick={handleOpenMonthly}
          className="
            w-full flex items-center justify-center gap-1
            px-2 py-1.5 rounded-lg text-xs font-medium
            bg-indigo-500 text-white hover:bg-indigo-600 transition-colors
          "
        >
          월간 플래너에서 작성
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    );
  }

  // 3) 월간 플래너 자체가 없음 → 만들기 유도
  return (
    <div className="w-48 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 border-dashed p-3 mb-3">
      <div className="flex items-center gap-1.5 mb-2">
        <StarIcon className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-600">이번 주 포커스</span>
      </div>
      <p className="text-xs text-slate-400 mb-3 leading-snug">
        {monthName} 월간 플래너를 만들어 주간 포커스를 작성해보세요
      </p>
      <button
        onClick={handleCreateMonthly}
        className="
          w-full flex items-center justify-center gap-1
          px-2 py-1.5 rounded-lg text-xs font-medium
          bg-indigo-500 text-white hover:bg-indigo-600 transition-colors
        "
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {monthName} 플래너 만들기
      </button>
    </div>
  );
}
