'use client';

import React from 'react';
import { WeeklyFocus, getWeeklyFocusRows } from '@/types/monthly';
import { useHolidayStore } from '@/hooks/useHolidays';
import { getHolidaysInMonth, toIsoDate } from '@/lib/holidays';
import { getWeeksOfMonth, isDateInMonth, SATURDAY_INDEX, SUNDAY_INDEX, WEEKDAY_LABELS } from '@/lib/weekUtils';
import { RETAINED_WEEK_NOTE } from './WeeklyFocus';

interface CompactCalendarProps {
  year: number;
  month: number;
  weeklyFocus: WeeklyFocus[];
}

export function CompactCalendar({ year, month, weeklyFocus }: CompactCalendarProps) {
  const manualHolidays = useHolidayStore((s) => s.manualHolidays);
  const toggleManualHoliday = useHolidayStore((s) => s.toggleManualHoliday);
  const holidayMap = getHolidaysInMonth(year, month, manualHolidays);
  // 행은 공통 주차 규칙(월~일, 1일이 든 주 = W1)과 같다. 다른 달 날짜는 빈 칸
  const weeks = getWeeksOfMonth(year, month);
  const focusRows = getWeeklyFocusRows({ year, month, weeklyFocus });

  const todayIso = toIsoDate(new Date());

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Calendar grid */}
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 items-center">
        {/* Header: empty + day labels */}
        <div />
        {WEEKDAY_LABELS.map((day, idx) => (
          <div
            key={day}
            className={`
              text-center text-xs font-medium py-1
              ${idx === SUNDAY_INDEX ? 'text-red-400' : idx === SATURDAY_INDEX ? 'text-blue-400' : 'text-slate-500'}
            `}
          >
            {day}
          </div>
        ))}

        {/* Calendar rows: W{n} label + 7 days */}
        {weeks.map(({ weekOfMonth, dates }) => (
          <React.Fragment key={`week-${weekOfMonth}`}>
            {/* Week label */}
            <div className="text-xs font-semibold text-slate-400 px-1 text-center">
              W{weekOfMonth}
            </div>

            {/* Days */}
            {dates.map((date, dayIndex) => {
              if (!isDateInMonth(date, year, month)) {
                return <div key={`empty-${weekOfMonth}-${dayIndex}`} className="h-7" />;
              }

              const day = date.getDate();
              const iso = toIsoDate(date);
              const isToday = iso === todayIso;
              const isSunday = dayIndex === SUNDAY_INDEX;
              const isSaturday = dayIndex === SATURDAY_INDEX;
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
                  key={`day-${day}`}
                  type="button"
                  onClick={handleClick}
                  disabled={isAuto}
                  title={title}
                  data-week={weekOfMonth}
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
      <ul aria-label="주차별 포커스" className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
        {focusRows.map(({ weekNumber, text, inMonth }) => (
          <li key={`focus-${weekNumber}`} className="flex items-start gap-2">
            <span className="text-xs font-semibold text-slate-400 flex-shrink-0 w-6">
              W{weekNumber}
            </span>
            {text ? (
              <span className="text-xs text-slate-600 leading-snug break-words">
                {text}
                {!inMonth && <span className="ml-1 text-amber-700">· {RETAINED_WEEK_NOTE}</span>}
              </span>
            ) : (
              <span className="text-xs text-slate-300 italic">미설정</span>
            )}
          </li>
        ))}
      </ul>

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
        <div className="text-xs text-slate-400 w-full">
          날짜 클릭으로 수동 휴일 토글 (공휴일은 잠금) · 주는 월~일, 1일이 든 주가 W1
        </div>
      </div>
    </div>
  );
}
