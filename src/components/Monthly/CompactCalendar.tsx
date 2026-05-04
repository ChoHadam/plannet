'use client';

import React from 'react';
import { WeeklyFocus, getDaysInMonth, getFirstDayOfMonth } from '@/types/monthly';
import { useHolidayStore } from '@/hooks/useHolidays';
import { getHolidaysInMonth, toIsoDate } from '@/lib/holidays';

interface CompactCalendarProps {
  year: number;
  month: number;
  weeklyFocus: WeeklyFocus[];
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function CompactCalendar({ year, month, weeklyFocus }: CompactCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);
  const manualHolidays = useHolidayStore((s) => s.manualHolidays);
  const toggleManualHoliday = useHolidayStore((s) => s.toggleManualHoliday);
  const holidayMap = getHolidaysInMonth(year, month, manualHolidays);

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
              const date = new Date(year, month - 1, day);
              const iso = toIsoDate(date);
              const holiday = holidayMap[iso];
              const isAuto = holiday?.source === 'auto';
              const isManual = holiday?.source === 'manual';

              const handleClick = () => {
                if (isAuto) return; // auto는 read-only
                toggleManualHoliday(date);
              };

              const title = holiday?.name || (isAuto ? '공휴일' : '');

              return (
                <button
                  key={`day-${weekIndex}-${day}`}
                  type="button"
                  onClick={handleClick}
                  disabled={isAuto}
                  title={title}
                  className={`
                    h-7 rounded-md flex items-center justify-center
                    text-xs font-medium
                    transition-colors
                    ${isToday ? 'ring-2 ring-red-400 ring-offset-1' : ''}
                    ${isAuto ? 'bg-red-50 text-red-600 cursor-not-allowed' : ''}
                    ${isManual ? 'bg-red-100 text-red-700' : ''}
                    ${!holiday && isToday ? 'bg-red-50' : ''}
                    ${!holiday && isSunday ? 'text-red-500' : ''}
                    ${!holiday && isSaturday ? 'text-blue-500' : ''}
                    ${!holiday && !isSunday && !isSaturday ? 'text-slate-700' : ''}
                    ${!isAuto ? 'hover:bg-slate-100' : ''}
                  `}
                >
                  {day}
                </button>
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
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded border-2 border-red-400 bg-red-50" />
          <span>오늘</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-red-50" />
          <span>공휴일</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-red-100" />
          <span>수동 휴일</span>
        </div>
        <div className="text-[10px] text-slate-400 w-full">
          날짜 클릭으로 수동 휴일 토글 (공휴일은 잠금)
        </div>
      </div>
    </div>
  );
}
