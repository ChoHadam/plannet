'use client';

import { useState } from 'react';
import { WeeklyFocus as WeeklyFocusType, getWeeklyFocusRows } from '@/types/monthly';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { isImeComposing } from '@/lib/keyboard';
import { FOCUS_RING } from '@/lib/constants';

/** 날짜를 옮기거나 복제해 이 달에는 없는 주에 남은 내용. 지우지 않고 보여 준다 */
export const RETAINED_WEEK_NOTE = '이 달에 없는 주 · 보관된 내용';

interface WeeklyFocusProps {
  year: number;
  month: number;
  weeklyFocus: WeeklyFocusType[];
}

export function WeeklyFocus({ year, month, weeklyFocus }: WeeklyFocusProps) {
  const updateWeeklyFocus = useMonthlyStore((state) => state.updateWeeklyFocus);
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const rows = getWeeklyFocusRows({ year, month, weeklyFocus });

  const handleStartEditing = (weekNumber: number, text: string) => {
    setEditingWeek(weekNumber);
    setEditText(text);
  };

  const handleSave = (weekNumber: number) => {
    updateWeeklyFocus(weekNumber, editText);
    setEditingWeek(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, weekNumber: number) => {
    if (isImeComposing(e)) return;
    if (e.key === 'Enter') {
      handleSave(weekNumber);
    } else if (e.key === 'Escape') {
      setEditingWeek(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">
        주간 포커스
      </h3>
      <p className="text-xs text-slate-400 mb-3">
        각 주에 집중할 핵심 과업이나 영역을 적어보세요.
        {' '}<span className="font-semibold text-slate-500">주간 플랜과 자동 연동되어</span> 매일 목표를 놓치지 않아요.
      </p>

      <div className="space-y-2">
        {rows.map(({ weekNumber, text, inMonth }) => (
          <div key={weekNumber} data-testid={`weekly-focus-W${weekNumber}`}>
            <div className="flex items-center gap-3">
              {/* Week label */}
              <span className={`w-8 text-xs font-medium ${inMonth ? 'text-slate-500' : 'text-amber-700'}`}>
                W{weekNumber}
              </span>

              {/* Input or text */}
              {editingWeek === weekNumber ? (
                <input
                  type="text"
                  value={editText}
                  data-local-draft
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, weekNumber)}
                  onBlur={() => handleSave(weekNumber)}
                  autoFocus
                  aria-label={`W${weekNumber} 포커스`}
                  className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                  placeholder="이 주의 핵심 과업..."
                />
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartEditing(weekNumber, text)}
                  className={`
                    flex-1 text-left text-sm px-3 py-2 rounded-lg cursor-text
                    ${text
                      ? 'bg-slate-50 text-slate-700'
                      : 'bg-slate-50 text-slate-400 italic'}
                    ${FOCUS_RING}
                  `}
                >
                  {text || '클릭하여 입력...'}
                </button>
              )}
            </div>
            {!inMonth && (
              <p className="mt-1 ml-11 text-xs text-amber-700">{RETAINED_WEEK_NOTE}. 필요하면 다른 주로 옮겨 적고 지우세요.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
