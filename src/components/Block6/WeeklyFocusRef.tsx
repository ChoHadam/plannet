'use client';

import { useState, useEffect, KeyboardEvent } from 'react';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useBlock6Store } from '@/hooks/useBlock6';
import { getCurrentWeeklyFocus } from '@/lib/weekUtils';

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
}

export function WeeklyFocusRef({ planYear, planMonth }: WeeklyFocusRefProps) {
  const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);
  const currentBlock6Id = useBlock6Store((state) => state.currentBlock6Id);
  const block6Plans = useBlock6Store((state) => state.block6Plans);
  const updateCustomFocus = useBlock6Store((state) => state.updateCustomFocus);

  const currentBlock6 = block6Plans.find((p) => p.id === currentBlock6Id);
  const customFocus = currentBlock6?.customFocus || '';

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(customFocus);

  useEffect(() => {
    setDraftText(customFocus);
  }, [customFocus]);

  const now = new Date();
  const targetDate = (planYear && planMonth)
    ? new Date(planYear, planMonth - 1, 1)
    : now;
  const { focus, monthlyPlan, weekNumber } = getCurrentWeeklyFocus(monthlyPlans, targetDate);

  const displayMonth = planMonth ?? (now.getMonth() + 1);
  const monthName = MONTH_NAMES[displayMonth - 1];

  const saveCustomFocus = () => {
    updateCustomFocus(draftText.trim());
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCustomFocus();
    } else if (e.key === 'Escape') {
      setDraftText(customFocus);
      setEditing(false);
    }
  };

  // 월간 플래너가 있고 해당 주에 포커스가 설정되어 있으면 → 우선 표시
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

  // 월간 플래너 미연동 또는 포커스 미설정 → 수기 입력 모드
  return (
    <div className="w-48 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <StarIcon className={customFocus ? 'text-indigo-500' : 'text-slate-400'} />
          <span className="text-xs font-semibold text-slate-600">이번 주 포커스</span>
        </div>
        {customFocus && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            편집
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveCustomFocus}
            placeholder="이번 주에 집중할 내용..."
            autoFocus
            rows={3}
            className="
              w-full text-sm text-slate-700 leading-snug
              bg-white border border-slate-300 rounded-md p-2
              focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300
              resize-none
            "
          />
          <p className="text-[10px] text-slate-400 mt-1">Enter 저장 · Esc 취소</p>
        </>
      ) : customFocus ? (
        <p
          className="text-sm text-slate-700 leading-snug whitespace-pre-wrap cursor-text"
          onClick={() => setEditing(true)}
        >
          {customFocus}
        </p>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-left text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
        >
          + 클릭해서 포커스 입력
        </button>
      )}

      {!editing && (
        <p className="text-[10px] text-slate-400 mt-2">
          {monthlyPlan ? `${monthName} W${weekNumber} (포커스 미설정)` : `${monthName} 월간 플래너 미연동`}
        </p>
      )}
    </div>
  );
}
