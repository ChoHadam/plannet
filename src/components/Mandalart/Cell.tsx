'use client';

import { useRef, useEffect, useState } from 'react';
import { CellSchedule } from '@/types/mandalart';

interface CellProps {
  value: string;
  onChange: (value: string) => void;
  isMainGoal?: boolean;
  isSubGoal?: boolean;
  backgroundColor: string;
  placeholder?: string;
  disabled?: boolean;
  completed?: boolean;
  onToggleCompleted?: () => void;
  icon?: string;
  onIconClick?: () => void;
  onClearCell?: () => void;
  schedule?: CellSchedule;
  onScheduleClick?: () => void;
}

function hasSchedule(schedule?: CellSchedule): boolean {
  if (!schedule) return false;
  return !!(schedule.repeat || schedule.targetMonths?.length || schedule.startDate || schedule.endDate);
}

export function Cell({
  value,
  onChange,
  isMainGoal = false,
  isSubGoal = false,
  backgroundColor,
  placeholder = '',
  disabled = false,
  completed = false,
  onToggleCompleted,
  icon,
  onIconClick,
  onClearCell,
  schedule,
  onScheduleClick,
}: CellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleCellClick = () => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div
      onClick={handleCellClick}
      className={`
        group/cell
        relative w-full aspect-square p-1.5
        flex items-center justify-center
        border border-slate-200/50
        transition-all duration-200 ease-out
        cursor-text
        ${!disabled ? 'hover:scale-[1.03] hover:shadow-md hover:z-10' : ''}
        ${!disabled ? 'focus-within:scale-[1.03] focus-within:shadow-lg focus-within:z-10' : ''}
        ${isMainGoal ? 'ring-2 ring-amber-400 shadow-lg z-20' : ''}
        ${isSubGoal && !disabled ? 'ring-1 ring-slate-300' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
      style={{ backgroundColor }}
    >
      {icon ? (
        <div className={`flex flex-col items-center justify-center gap-0.5 ${completed ? 'opacity-50' : ''}`}>
          <span className={`${isMainGoal ? 'text-2xl' : isSubGoal ? 'text-xl' : 'text-lg'}`}>{icon}</span>
          {localValue && (
            <span className={`
              text-center leading-tight truncate max-w-full
              ${isMainGoal ? 'text-xs font-bold text-slate-700' : ''}
              ${isSubGoal ? 'text-[10px] font-bold text-slate-600' : ''}
              ${!isMainGoal && !isSubGoal ? 'text-[10px] text-slate-500' : ''}
              ${completed ? 'line-through' : ''}
            `}>
              {localValue}
            </span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full p-0
            bg-transparent resize-none
            text-center leading-tight
            focus:outline-none
            placeholder:text-slate-400/60
            overflow-hidden
            transition-all duration-200
            ${isMainGoal ? 'text-sm font-bold text-slate-700' : ''}
            ${isSubGoal ? 'text-xs font-bold text-slate-600' : ''}
            ${!isMainGoal && !isSubGoal ? 'text-xs text-slate-500' : ''}
            ${disabled ? 'cursor-not-allowed' : ''}
            ${completed ? 'line-through opacity-50' : ''}
          `}
          rows={1}
        />
      )}

      {/* 체크 버튼 (좌측 상단, 호버 시 표시) - 핵심 목표, 이모지 셀 제외 */}
      {localValue.trim() && !icon && onToggleCompleted && !disabled && !isMainGoal && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompleted();
          }}
          className={`
            absolute top-0.5 left-0.5
            w-4 h-4 rounded-full
            flex items-center justify-center
            shadow-sm border
            z-20
            transition-all duration-200
            ${completed
              ? 'bg-emerald-500 border-emerald-600 text-white opacity-100'
              : 'bg-white border-slate-200 text-slate-400 opacity-0 group-hover/cell:opacity-100 hover:border-slate-300 hover:text-slate-600'
            }
            max-sm:opacity-100
          `}
          title={completed ? '완료 취소' : '완료'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      )}

      {/* 이모지 버튼 (우측 상단, 호버 시 표시) - 텍스트가 없거나 이모지가 있는 셀 */}
      {!disabled && onIconClick && (!localValue.trim() || icon) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIconClick();
          }}
          className={`
            absolute top-0.5 right-0.5
            w-4 h-4 rounded-full
            flex items-center justify-center
            shadow-sm border
            z-20
            transition-all duration-200
            ${icon
              ? 'bg-amber-100 border-amber-300 opacity-100'
              : 'bg-white border-slate-200 opacity-0 group-hover/cell:opacity-100 hover:border-slate-300'
            }
            max-sm:opacity-100
          `}
          title="이모지 선택"
        >
          <span className="text-[10px]">{icon || '😊'}</span>
        </button>
      )}

      {/* 스케줄 버튼 (좌측 하단, 호버 시 표시) - action item 셀만 */}
      {localValue.trim() && !icon && onScheduleClick && !disabled && !isMainGoal && !isSubGoal && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onScheduleClick();
          }}
          className={`
            absolute bottom-0.5 left-0.5
            w-4 h-4 rounded-full
            flex items-center justify-center
            shadow-sm border
            z-20
            transition-all duration-200
            ${hasSchedule(schedule)
              ? 'bg-indigo-500 border-indigo-600 text-white opacity-100'
              : 'bg-white border-slate-200 text-slate-400 opacity-0 group-hover/cell:opacity-100 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50'
            }
            max-sm:opacity-100
          `}
          title={hasSchedule(schedule) ? '스케줄 편집' : '스케줄 설정'}
        >
          {schedule?.repeat ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          )}
        </button>
      )}

      {/* 휴지통 버튼 (우측 하단, 호버 시 표시) - 내용이 있을 때만 */}
      {!disabled && onClearCell && (localValue.trim() || icon) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirmClear) {
              onClearCell();
              setConfirmClear(false);
            } else {
              setConfirmClear(true);
              setTimeout(() => setConfirmClear(false), 2000);
            }
          }}
          className={`
            absolute bottom-0.5 right-0.5
            rounded-full
            flex items-center justify-center
            shadow-sm border
            z-20
            transition-all duration-200
            max-sm:opacity-100
            ${confirmClear
              ? 'w-auto h-4 px-1.5 bg-red-500 border-red-600 text-white opacity-100'
              : 'w-4 h-4 bg-white border-slate-200 text-slate-400 opacity-0 group-hover/cell:opacity-100 hover:border-red-300 hover:text-red-500 hover:bg-red-50'
            }
          `}
          title={confirmClear ? '클릭하여 삭제' : '초기화'}
        >
          {confirmClear ? (
            <span className="text-[10px] font-medium whitespace-nowrap">삭제할까요?</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
