'use client';

import { useState } from 'react';
import { CalendarEvent, getDaysInMonth, getFirstDayOfMonth } from '@/types/monthly';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { MONTHLY_COLORS } from '@/lib/constants';

interface CompactCalendarProps {
  year: number;
  month: number;
  events: CalendarEvent[];
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function CompactCalendar({ year, month, events }: CompactCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [newEventText, setNewEventText] = useState('');

  const addEvent = useMonthlyStore((state) => state.addEvent);
  const deleteEvent = useMonthlyStore((state) => state.deleteEvent);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);

  // Get today's date for highlighting
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  // Create calendar grid
  const calendarDays: (number | null)[] = [];

  // Add empty cells for days before the first day of month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // Get events for a specific date
  const getEventsForDate = (date: number) => {
    return events.filter((e) => e.date === date);
  };

  const handleAddEvent = () => {
    if (selectedDate && newEventText.trim()) {
      addEvent(selectedDate, newEventText.trim());
      setNewEventText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleAddEvent();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Calendar header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
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
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const dayEvents = getEventsForDate(day);
          const hasEvents = dayEvents.length > 0;
          const isToday = day === todayDate;
          const isSelected = day === selectedDate;
          const dayOfWeek = (firstDayOfMonth + day - 1) % 7;
          const isSunday = dayOfWeek === 0;
          const isSaturday = dayOfWeek === 6;

          return (
            <button
              key={day}
              onClick={() => setSelectedDate(day === selectedDate ? null : day)}
              className={`
                aspect-square rounded-lg flex flex-col items-center justify-center
                text-sm transition-all relative
                ${isToday ? 'ring-2 ring-red-400 ring-offset-1' : ''}
                ${isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}
                ${!isSelected && isSunday ? 'text-red-500' : ''}
                ${!isSelected && isSaturday ? 'text-blue-500' : ''}
                ${!isSelected && !isSunday && !isSaturday ? 'text-slate-700' : ''}
              `}
            >
              <span className="font-medium">{day}</span>
              {hasEvents && (
                <div className="absolute bottom-1 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((event, i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: event.color || MONTHLY_COLORS.eventDot }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <h4 className="text-sm font-medium text-slate-700 mb-2">
            {month}월 {selectedDate}일
          </h4>

          {/* Event list */}
          <div className="space-y-1 mb-3">
            {getEventsForDate(selectedDate).length > 0 ? (
              getEventsForDate(selectedDate).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 text-xs text-slate-600 py-1 px-2 bg-slate-50 rounded group"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.color || MONTHLY_COLORS.eventDot }}
                  />
                  <span className="flex-1 truncate">{event.text}</span>
                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">이벤트가 없습니다</p>
            )}
          </div>

          {/* Add event input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newEventText}
              onChange={(e) => setNewEventText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="이벤트 추가..."
              className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <button
              onClick={handleAddEvent}
              disabled={!newEventText.trim()}
              className="px-2 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              추가
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: MONTHLY_COLORS.eventDot }}
          />
          <span>이벤트</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded border-2 border-red-400" />
          <span>오늘</span>
        </div>
      </div>
    </div>
  );
}
