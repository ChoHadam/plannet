'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRecurringStore } from '@/hooks/useRecurring';
import { TodoColor } from '@/types/block6';
import { TODO_COLORS, TODO_COLOR_BAR, TODO_COLOR_LABELS } from '@/lib/constants';

interface RecurringTodosInlineProps {
  onAdd: (text: string, color?: TodoColor) => void;
}

export function RecurringTodosInline({ onAdd }: RecurringTodosInlineProps) {
  const todos = useRecurringStore((s) => s.todos);
  const addTodo = useRecurringStore((s) => s.addTodo);
  const updateColor = useRecurringStore((s) => s.updateColor);
  const deleteTodo = useRecurringStore((s) => s.deleteTodo);

  const [newText, setNewText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 색상 선택기 닫기
  useEffect(() => {
    if (!colorPickerId) return;
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColorPickerId(null);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [colorPickerId]);

  if (todos.length === 0 && !isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 transition-colors"
      >
        + 고정 할일 등록
      </button>
    );
  }

  const handleAdd = () => {
    if (!newText.trim()) return;
    addTodo(newText);
    setNewText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="border-t border-slate-200 pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">고정 할일</span>
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {todos.map((todo) => {
          const todoColor = todo.color || 'none';
          const barColor = TODO_COLOR_BAR[todoColor];
          return (
            <div
              key={todo.id}
              className="group flex items-center gap-1.5 px-1 py-1 rounded hover:bg-slate-50 transition-colors relative"
              style={
                todoColor !== 'none'
                  ? { borderLeft: `3px solid ${barColor}`, paddingLeft: '4px' }
                  : undefined
              }
            >
              {/* Add to plan button */}
              <button
                onClick={() => onAdd(todo.text, todo.color)}
                className="w-3.5 h-3.5 rounded flex items-center justify-center
                         text-slate-300 hover:text-emerald-500 transition-colors flex-shrink-0"
                title="플랜에 추가"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <span className="flex-1 text-xs text-slate-600 truncate">{todo.text}</span>

              {/* Color picker toggle */}
              <button
                onClick={() => setColorPickerId(colorPickerId === todo.id ? null : todo.id)}
                className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 rounded-full flex-shrink-0
                         transition-all border border-slate-200"
                style={{
                  backgroundColor: todoColor === 'none' ? '#F3F4F6' : barColor,
                }}
                title="색상 변경"
              />

              {/* Delete */}
              <button
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 w-3.5 h-3.5 rounded flex items-center justify-center
                         text-slate-300 hover:text-red-500 transition-all flex-shrink-0"
                title="삭제"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Color picker dropdown */}
              {colorPickerId === todo.id && (
                <div
                  ref={pickerRef}
                  className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-slate-200 p-2"
                >
                  <div className="grid grid-cols-3 gap-1">
                    {TODO_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          updateColor(todo.id, color);
                          setColorPickerId(null);
                        }}
                        className={`
                          w-6 h-6 rounded-full border-2 transition-all
                          ${todoColor === color ? 'border-slate-400 scale-110' : 'border-transparent hover:scale-105'}
                        `}
                        style={{
                          backgroundColor: color === 'none' ? '#F3F4F6' : TODO_COLOR_BAR[color],
                        }}
                        title={TODO_COLOR_LABELS[color]}
                      >
                        {color === 'none' && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" className="w-full h-full p-1">
                            <line x1="18" y1="6" x2="6" y2="18" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add input */}
      <div className="flex items-center gap-1 mt-1">
        <input
          ref={inputRef}
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsEditing(true)}
          placeholder="+ 고정 할일 추가"
          className="flex-1 text-xs text-slate-500 placeholder:text-slate-300
                   bg-transparent border-none outline-none"
        />
        {newText.trim() && (
          <button
            onClick={handleAdd}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            추가
          </button>
        )}
      </div>
    </div>
  );
}
