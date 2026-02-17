'use client';

import { WeeklyFocus, getDaysInMonth, getFirstDayOfMonth } from '@/types/monthly';
import { MONTHLY_COLORS } from '@/lib/constants';

interface CompactCalendarProps {
  year: number;
  month: number;
  weeklyFocus: WeeklyFocus[];
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function CompactCalendar({ year, month, weeklyFocus }: CompactCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);

  // Get today's date for highlighting
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  // Create calendar grid organized by weeks
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  // Add empty cells for days before the first day of month
  for (let i = 0; i < firstDayOfMonth; i++) {
    currentWeek.push(null);
  }

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);

    // Start new week on Sunday (after Saturday)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Add remaining days to last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  // Get weekly focus text for a given week index
  const getWeekFocusText = (weekIndex: number): string => {
    const focus = weeklyFocus.find((w) => w.weekNumber === weekIndex + 1);
    return focus?.text || '';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Calendar header */}
      <div className="grid grid-cols-7 gap-1 mb-2" style={{ width: '196px' }}>
        {DAY_LABELS.map((day, idx) => (
          <div
            key={day}
            className={`
              w-7 text-center text-xs font-medium py-1
              ${idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-slate-500'}
            `}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid by weeks */}
      <div className="space-y-1">
        {weeks.map((week, weekIndex) => {
          const focusText = getWeekFocusText(weekIndex);

          return (
            <div key={weekIndex} className="flex items-center gap-2">
              {/* Days row */}
              <div className="grid grid-cols-7 gap-1 flex-shrink-0" style={{ width: '196px' }}>
                {week.map((day, dayIndex) => {
                  if (day === null) {
                    return <div key={`empty-${weekIndex}-${dayIndex}`} className="w-7 h-7" />;
                  }

                  const isToday = day === todayDate;
                  const dayOfWeek = (firstDayOfMonth + day - 1) % 7;
                  const isSunday = dayOfWeek === 0;
                  const isSaturday = dayOfWeek === 6;

                  return (
                    <div
                      key={day}
                      className={`
                        w-7 h-7 rounded-md flex items-center justify-center
                        text-xs font-medium
                        ${isToday ? 'ring-2 ring-red-400 ring-offset-1 bg-red-50' : ''}
                        ${isSunday ? 'text-red-500' : ''}
                        ${isSaturday ? 'text-blue-500' : ''}
                        ${!isSunday && !isSaturday ? 'text-slate-700' : ''}
                      `}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>

              {/* Weekly focus text */}
              <div className="flex-1 min-w-0">
                {focusText ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-400 flex-shrink-0">
                      W{weekIndex + 1}
                    </span>
                    <span className="text-xs text-slate-600 truncate">
                      {focusText}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-300">
                    W{weekIndex + 1}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded border-2 border-red-400 bg-red-50" />
          <span>오늘</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span>W1~W5: 주간 포커스</span>
        </div>
      </div>
    </div>
  );
}
