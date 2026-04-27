'use client';

import React from 'react';
import { WeeklyFocus, getDaysInMonth, getFirstDayOfMonth } from '@/types/monthly';

interface CompactCalendarProps {
  year: number;
  month: number;
  weeklyFocus: WeeklyFocus[];
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function CompactCalendar({ year, month, weeklyFocus }: CompactCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  // Create calendar grid organized by weeks
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  for (let i = 0; i < firstDayOfMonth; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  const getWeekFocusText = (weekIndex: number): string => {
    const focus = weeklyFocus.find((w) => w.weekNumber === weekIndex + 1);
    return focus?.text || '';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Calendar grid */}
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 items-center">
        {/* Header: empty + day labels */}
        <div />
        {DAY_LABELS.map((day, idx) => (
          <div
            key={day}
            className={`
              text-center text-xs font-medium py-1
              ${idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-slate-500'}
            `}
          >
            {day}
          </div>
        ))}

        {/* Calendar rows: W{n} label + 7 days */}
        {weeks.map((week, weekIndex) => (
          <React.Fragment key={`week-${weekIndex}`}>
            {/* Week label */}
            <div className="text-[10px] font-semibold text-slate-400 px-1 text-center">
              W{weekIndex + 1}
            </div>

            {/* Days */}
            {week.map((day, dayIndex) => {
              if (day === null) {
                return <div key={`empty-${weekIndex}-${dayIndex}`} className="h-7" />;
              }

              const isToday = day === todayDate;
              const dayOfWeek = (firstDayOfMonth + day - 1) % 7;
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <div
                  key={`day-${weekIndex}-${day}`}
                  className={`
                    h-7 rounded-md flex items-center justify-center
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
          </React.Fragment>
        ))}
      </div>

      {/* Weekly Focus list (vertical) */}
      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
        {weeks.map((_, weekIndex) => {
          const focusText = getWeekFocusText(weekIndex);
          return (
            <div key={`focus-${weekIndex}`} className="flex items-start gap-2">
              <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0 mt-0.5 w-5">
                W{weekIndex + 1}
              </span>
              {focusText ? (
                <span className="text-xs text-slate-600 leading-snug break-words">
                  {focusText}
                </span>
              ) : (
                <span className="text-xs text-slate-300 italic">미설정</span>
              )}
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
      </div>
    </div>
  );
}
