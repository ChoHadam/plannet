'use client';

import { useState } from 'react';
import { PlanCategory } from '@/types/mandalart';
import { getWeekOfMonth, getWeeksOfMonth } from '@/lib/weekUtils';
import type { WeekOfMonthMeta } from '@/lib/weekUtils';

interface DatePickerProps {
  category: PlanCategory;
  year?: number;
  month?: number;
  week?: number;
  day?: number;
  onSelect: (year?: number, month?: number, week?: number, day?: number) => void;
  onClose: () => void;
}

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const getWeekOfDate = (date: Date, weeks: WeekOfMonthMeta[]) => {
  const time = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return weeks.find((w) => w.start.getTime() <= time && time <= w.end.getTime())?.weekOfMonth;
};

// Get days in month for calendar (Sunday start for display)
const getDaysInMonth = (year: number, month: number) => {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay(); // 0=일요일

  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }
  return days;
};

export function DatePicker({
  category,
  year: initialYear,
  month: initialMonth,
  week: initialWeek,
  day: initialDay,
  onSelect,
  onClose,
}: DatePickerProps) {
  const now = new Date();
  const [year, setYear] = useState(initialYear || now.getFullYear());
  const [month, setMonth] = useState(initialMonth || now.getMonth() + 1);
  const [week, setWeek] = useState(initialWeek || getWeekOfMonth(now));
  const [day, setDay] = useState(initialDay || now.getDate());

  const handleConfirm = () => {
    switch (category) {
      case 'annual':
        onSelect(year, undefined, undefined, undefined);
        break;
      case 'monthly':
        onSelect(year, month, undefined, undefined);
        break;
      case 'weekly':
        onSelect(year, month, week, undefined);
        break;
      case 'daily':
        onSelect(year, month, undefined, day);
        break;
    }
    onClose();
  };

  const daysInMonth = getDaysInMonth(year, month);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-5 min-w-[300px] animate-in fade-in zoom-in duration-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 text-center">
          날짜 선택
        </h3>

        {/* Year selector - always shown */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span className="text-lg font-medium text-slate-700 min-w-[80px] text-center">
            {year}년
          </span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        {/* Month selector - for monthly, weekly, daily */}
        {category !== 'annual' && (
          <>
            {(category === 'daily' || category === 'weekly') ? (
              // Month navigation for daily and weekly
              <div className="flex items-center justify-center gap-4 mb-3">
                <button
                  onClick={() => {
                    if (month === 1) {
                      setMonth(12);
                      setYear(y => y - 1);
                    } else {
                      setMonth(m => m - 1);
                    }
                    if (category === 'weekly') setWeek(1);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <span className="text-base font-medium text-slate-600 min-w-[50px] text-center">
                  {month}월
                </span>
                <button
                  onClick={() => {
                    if (month === 12) {
                      setMonth(1);
                      setYear(y => y + 1);
                    } else {
                      setMonth(m => m + 1);
                    }
                    if (category === 'weekly') setWeek(1);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            ) : (
              // Month grid for monthly only
              <div className="grid grid-cols-4 gap-2 mb-4">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setMonth(i + 1)}
                    className={`
                      px-2 py-2 rounded-lg text-sm font-medium transition-colors
                      ${month === i + 1
                        ? 'bg-slate-800 text-white'
                        : 'hover:bg-slate-100 text-slate-600'
                      }
                    `}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Week selector - calendar style for weekly (Monday-based weeks) */}
        {category === 'weekly' && (() => {
          const monthWeeks = getWeeksOfMonth(year, month);

          // Calculate previous month days to show
          const firstDayDate = new Date(year, month - 1, 1);
          const firstDayOfWeek = firstDayDate.getDay(); // 0=일요일
          const prevMonthLastDay = new Date(year, month - 1, 0).getDate();

          // Calculate next month days to show
          const lastDayDate = new Date(year, month, 0);
          const lastDayOfWeek = lastDayDate.getDay(); // 0=일
          const nextMonthDays = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;

          // Build calendar array with prev/current/next month days
          const calendarDays: { day: number; isPrevMonth?: boolean; isNextMonth?: boolean }[] = [];

          // Add previous month days (to fill the first row)
          for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            calendarDays.push({ day: prevMonthLastDay - i, isPrevMonth: true });
          }

          // Add current month days
          const currentMonthLastDay = lastDayDate.getDate();
          for (let i = 1; i <= currentMonthLastDay; i++) {
            calendarDays.push({ day: i });
          }

          // Add next month days (to fill the last row)
          if (nextMonthDays > 0) {
            for (let i = 1; i <= nextMonthDays; i++) {
              calendarDays.push({ day: i, isNextMonth: true });
            }
          }

          const selectedWeek = monthWeeks.find((w) => w.weekOfMonth === week);

          return (
            <div className="mb-4">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((wd, i) => (
                  <div
                    key={wd}
                    className={`
                      text-center text-xs font-medium py-1
                      ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}
                    `}
                  >
                    {wd}
                  </div>
                ))}
              </div>
              {/* Calendar grid with Monday-based week selection */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map(({ day: d, isPrevMonth, isNextMonth }, i) => {
                  // Calculate the actual date
                  let baseYear = year;
                  let baseMonth = month;
                  if (isPrevMonth) {
                    baseMonth = month === 1 ? 12 : month - 1;
                    baseYear = month === 1 ? year - 1 : year;
                  } else if (isNextMonth) {
                    baseMonth = month === 12 ? 1 : month + 1;
                    baseYear = month === 12 ? year + 1 : year;
                  }

                  const dateObj = new Date(baseYear, baseMonth - 1, d);

                  const weekOfMonth = getWeekOfDate(dateObj, monthWeeks);
                  const belongsToMonth = weekOfMonth !== undefined;

                  // Highlight if this day belongs to the selected week (even if prev/next month)
                  const isInSelectedWeek = belongsToMonth && weekOfMonth === selectedWeek?.weekOfMonth;
                  const isOtherMonthDay = isPrevMonth || isNextMonth;

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (belongsToMonth && weekOfMonth && !isOtherMonthDay) {
                          setWeek(weekOfMonth);
                        }
                      }}
                      disabled={!belongsToMonth || isOtherMonthDay}
                      className={`
                        aspect-square rounded-lg text-sm font-medium transition-colors
                        ${isInSelectedWeek
                          ? isOtherMonthDay
                            ? 'bg-slate-600 text-white/80'
                            : 'bg-slate-800 text-white'
                          : isOtherMonthDay
                            ? belongsToMonth
                              ? 'text-slate-400 bg-slate-50'
                              : 'text-slate-300'
                            : !belongsToMonth
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'hover:bg-slate-100 text-slate-600'
                        }
                        ${!isInSelectedWeek && !isOtherMonthDay && belongsToMonth && i % 7 === 0 ? 'text-red-500' : ''}
                        ${!isInSelectedWeek && !isOtherMonthDay && belongsToMonth && i % 7 === 6 ? 'text-blue-500' : ''}
                      `}
                      title={
                        belongsToMonth
                          ? isOtherMonthDay
                            ? `${baseMonth}월 ${d}일 · ${month}월 ${weekOfMonth ?? ''}주차`
                            : `${month}월 ${weekOfMonth ?? ''}주차`
                          : `${baseMonth}월 ${d}일`
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              {/* Week range indicator */}
              {selectedWeek ? (
                <div className="mt-2 text-center text-sm text-slate-500">
                  {month}월 {selectedWeek.weekOfMonth}주차:{' '}
                  {(() => {
                    const startMonth = selectedWeek.start.getMonth() + 1;
                    const endMonth = selectedWeek.end.getMonth() + 1;
                    const startLabel = startMonth === month
                      ? `${selectedWeek.start.getDate()}일`
                      : `${startMonth}/${selectedWeek.start.getDate()}`;
                    const endLabel = endMonth === month
                      ? `${selectedWeek.end.getDate()}일`
                      : `${endMonth}/${selectedWeek.end.getDate()}`;
                    return `${startLabel} ~ ${endLabel}`;
                  })()}
                  <span className="text-xs text-slate-400 ml-1">(월~일)</span>
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* Calendar - for daily */}
        {category === 'daily' && (
          <div className="mb-4">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  className={`
                    text-center text-xs font-medium py-1
                    ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}
                  `}
                >
                  {wd}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {daysInMonth.map((d, i) => (
                <button
                  key={i}
                  onClick={() => d && setDay(d)}
                  disabled={!d}
                  className={`
                    aspect-square rounded-lg text-sm font-medium transition-colors
                    ${!d ? 'invisible' : ''}
                    ${d === day
                      ? 'bg-slate-800 text-white'
                      : 'hover:bg-slate-100 text-slate-600'
                    }
                    ${d && i % 7 === 0 ? 'text-red-500' : ''}
                    ${d && i % 7 === 6 ? 'text-blue-500' : ''}
                    ${d === day ? '!text-white' : ''}
                  `}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="
              flex-1 px-4 py-2 rounded-lg
              bg-slate-100 text-slate-600
              hover:bg-slate-200
              transition-colors font-medium
            "
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="
              flex-1 px-4 py-2 rounded-lg
              bg-slate-800 text-white
              hover:bg-slate-900
              transition-colors font-medium
            "
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to format date for display
export function formatPlanDate(
  category: PlanCategory,
  year?: number,
  month?: number,
  week?: number,
  day?: number,
  compact: boolean = false
): string {
  if (!year) return '';

  switch (category) {
    case 'annual':
      return compact ? `${year}` : `${year}년`;
    case 'monthly':
      if (!month) return compact ? `${year}` : `${year}년`;
      return compact ? `${year}.${String(month).padStart(2, '0')}` : `${year}년 ${month}월`;
    case 'weekly':
      if (!month || !week) return compact ? `${year}` : `${year}년`;
      return compact ? `${month}월 ${week}주차` : `${year}년 ${month}월 ${week}주차`;
    case 'daily':
      if (!month || !day) return compact ? `${year}` : `${year}년`;
      return compact
        ? `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`
        : `${year}년 ${month}월 ${day}일`;
    default:
      return '';
  }
}
