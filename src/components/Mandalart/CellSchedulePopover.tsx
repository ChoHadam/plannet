'use client';

import { useState } from 'react';
import { CellSchedule, RepeatCycle } from '@/types/mandalart';

interface CellSchedulePopoverProps {
  schedule?: CellSchedule;
  onSave: (schedule: CellSchedule | undefined) => void;
  onClose: () => void;
}

const REPEAT_OPTIONS: { value: RepeatCycle | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
];

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function isScheduleEmpty(s: CellSchedule): boolean {
  return !s.repeat
    && (!s.targetMonths || s.targetMonths.length === 0)
    && !s.startDate
    && !s.endDate;
}

export function CellSchedulePopover({ schedule, onSave, onClose }: CellSchedulePopoverProps) {
  const [repeat, setRepeat] = useState<RepeatCycle | null>(schedule?.repeat ?? null);
  const [repeatDays, setRepeatDays] = useState<number[]>(schedule?.repeatDays ?? []);
  const [targetMonths, setTargetMonths] = useState<number[]>(schedule?.targetMonths ?? []);
  const [startDate, setStartDate] = useState(schedule?.startDate ?? '');
  const [endDate, setEndDate] = useState(schedule?.endDate ?? '');

  const toggleMonth = (month: number) => {
    setTargetMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => a - b)
    );
  };

  const toggleDay = (day: number) => {
    setRepeatDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSave = () => {
    const newSchedule: CellSchedule = {};

    if (repeat) newSchedule.repeat = repeat;
    if (repeat === 'weekly' && repeatDays.length > 0) newSchedule.repeatDays = repeatDays;
    if (targetMonths.length > 0) newSchedule.targetMonths = targetMonths;
    if (startDate) newSchedule.startDate = startDate;
    if (endDate) newSchedule.endDate = endDate;

    onSave(isScheduleEmpty(newSchedule) ? undefined : newSchedule);
  };

  const handleReset = () => {
    setRepeat(null);
    setRepeatDays([]);
    setTargetMonths([]);
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-80 max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">스케줄 설정</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Repeat cycle */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">반복</label>
            <div className="flex gap-1">
              {REPEAT_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => {
                    setRepeat(opt.value);
                    if (opt.value !== 'weekly') setRepeatDays([]);
                  }}
                  className={`
                    flex-1 py-1.5 text-xs rounded-md font-medium transition-colors
                    ${(repeat ?? null) === opt.value
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly day selection */}
          {repeat === 'weekly' && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">요일</label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={`
                      w-9 h-8 text-xs rounded-md font-medium transition-colors
                      ${repeatDays.includes(idx)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }
                      ${idx === 0 ? 'text-red-500' : ''}
                      ${idx === 6 ? 'text-blue-500' : ''}
                      ${repeatDays.includes(idx) ? '!text-white' : ''}
                    `}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Target months */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">대상 월</label>
            <div className="grid grid-cols-6 gap-1">
              {MONTH_LABELS.map((label, idx) => {
                const month = idx + 1;
                return (
                  <button
                    key={month}
                    onClick={() => toggleMonth(month)}
                    className={`
                      py-1.5 text-xs rounded-md font-medium transition-colors
                      ${targetMonths.includes(month)
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }
                    `}
                  >
                    {label}월
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">기간</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md
                         focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                placeholder="시작일"
              />
              <span className="text-xs text-slate-400">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md
                         focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                placeholder="종료일"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <button
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            초기화
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs text-white bg-indigo-500 rounded-md hover:bg-indigo-600 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
