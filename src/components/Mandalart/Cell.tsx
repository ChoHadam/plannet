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
}

export function Cell({
  value,
  onChange,
  isMainGoal = false,
  isSubGoal = false,
  backgroundColor,
  placeholder = '',
  disabled = false,
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
          ${isMainGoal ? 'text-sm font-bold text-slate-800' : ''}
          ${isSubGoal ? 'text-xs font-bold text-slate-700' : ''}
          ${!isMainGoal && !isSubGoal ? 'text-xs text-slate-600' : ''}
          ${disabled ? 'cursor-not-allowed' : ''}
        `}
        rows={1}
      />
    </div>
  );
}
