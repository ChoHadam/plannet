'use client';

import { useRef, useEffect, useState } from 'react';

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
}: CellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);

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
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full
          bg-transparent resize-none
          text-center leading-tight
          focus:outline-none
          placeholder:text-slate-400/60
          overflow-hidden
          transition-all duration-200
          ${isMainGoal ? 'text-sm font-bold text-slate-800' : ''}
          ${isSubGoal ? 'text-xs font-bold text-slate-700' : ''}
          ${!isMainGoal && !isSubGoal ? 'text-xs text-slate-600' : ''}
          ${disabled ? 'cursor-not-allowed' : ''}
          ${completed ? 'line-through opacity-50' : ''}
        `}
        rows={1}
      />

      {/* 체크 버튼 (좌측 상단, 호버 시 표시) */}
      {localValue.trim() && onToggleCompleted && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompleted();
          }}
          className={`
            absolute -top-1.5 -left-1.5
            w-5 h-5 rounded-full
            flex items-center justify-center
            shadow-md border
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
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );
}
