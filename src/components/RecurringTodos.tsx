'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { useRecurringStore } from '@/hooks/useRecurring';

interface RecurringTodosInlineProps {
  onAdd: (text: string) => void;
}

export function RecurringTodosInline({ onAdd }: RecurringTodosInlineProps) {
  const todos = useRecurringStore((s) => s.todos);
  const addTodo = useRecurringStore((s) => s.addTodo);
  const deleteTodo = useRecurringStore((s) => s.deleteTodo);

  const [newText, setNewText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        {todos.map((todo) => (
          <div
            key={todo.id}
            className="group flex items-center gap-1.5 px-1 py-1 rounded hover:bg-slate-50 transition-colors"
          >
            {/* Add to plan button */}
            <button
              onClick={() => onAdd(todo.text)}
              className="w-3.5 h-3.5 rounded flex items-center justify-center
                       text-slate-300 hover:text-emerald-500 transition-colors flex-shrink-0"
              title="플랜에 추가"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <span className="flex-1 text-xs text-slate-600 truncate">{todo.text}</span>

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
          </div>
        ))}
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
