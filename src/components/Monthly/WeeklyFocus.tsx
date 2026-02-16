'use client';

import { useState } from 'react';
import { WeeklyFocus as WeeklyFocusType } from '@/types/monthly';
import { useMonthlyStore } from '@/hooks/useMonthly';

interface WeeklyFocusProps {
  weeklyFocus: WeeklyFocusType[];
}

export function WeeklyFocus({ weeklyFocus }: WeeklyFocusProps) {
  const updateWeeklyFocus = useMonthlyStore((state) => state.updateWeeklyFocus);
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const handleStartEditing = (week: WeeklyFocusType) => {
    setEditingWeek(week.weekNumber);
    setEditText(week.text);
  };

  const handleSave = (weekNumber: number) => {
    updateWeeklyFocus(weekNumber, editText);
    setEditingWeek(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, weekNumber: number) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleSave(weekNumber);
    } else if (e.key === 'Escape') {
      setEditingWeek(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        주간 포커스
      </h3>

      <div className="space-y-2">
        {weeklyFocus.map((week) => (
          <div key={week.weekNumber} className="flex items-center gap-3">
            {/* Week label */}
            <span className="w-8 text-xs font-medium text-slate-500">
              W{week.weekNumber}
            </span>

            {/* Input or text */}
            {editingWeek === week.weekNumber ? (
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, week.weekNumber)}
                onBlur={() => handleSave(week.weekNumber)}
                autoFocus
                className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                placeholder="이 주의 핵심 과업..."
              />
            ) : (
              <div
                onClick={() => handleStartEditing(week)}
                className={`
                  flex-1 text-sm px-3 py-2 rounded-lg cursor-text
                  ${week.text
                    ? 'bg-slate-50 text-slate-700'
                    : 'bg-slate-50 text-slate-400 italic'}
                `}
              >
                {week.text || '클릭하여 입력...'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Help text */}
      <p className="mt-3 text-xs text-slate-400">
        각 주에 집중할 핵심 과업이나 영역을 적어보세요
      </p>
    </div>
  );
}
