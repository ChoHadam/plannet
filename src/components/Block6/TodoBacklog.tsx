'use client';

import { useState, useMemo, KeyboardEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { TodoItem as TodoItemType, TodoColor } from '@/types/block6';
import { DraggableTodoItem } from './DraggableTodoItem';
import { useMandalartStore } from '@/hooks/useMandalart';
import { extractDailyHabits } from '@/lib/mandalartIntegration';

interface TodoBacklogProps {
  todos: TodoItemType[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onUpdateTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onColorChange?: (todoId: string, color: TodoColor) => void;
  onDuplicate?: (todoId: string) => void;
}

export function TodoBacklog({
  todos,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onColorChange,
  onDuplicate,
}: TodoBacklogProps) {
  const [newTodoText, setNewTodoText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const mandalarts = useMandalartStore((state) => state.mandalarts);
  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;

  const allDailyHabits = useMemo(() => {
    return mandalarts.flatMap((m) =>
      extractDailyHabits(m).map((h) => ({ ...h, mandalartId: m.id }))
    );
  }, [mandalarts]);

  const handleImportHabits = () => {
    if (allDailyHabits.length === 0) return;
    // Dedup: check if habit text already exists in backlog
    const existingTexts = new Set(todos.map((t) => t.text));
    const newHabits = allDailyHabits.filter((h) => !existingTexts.has(h.text));

    if (newHabits.length === 0) {
      setImportFeedback('이미 모두 추가되어 있습니다');
    } else {
      newHabits.forEach((h) => onAddTodo(h.text));
      setImportFeedback(`${newHabits.length}개 습관 추가됨`);
    }
    setTimeout(() => setImportFeedback(null), 2000);
  };

  const { isOver, setNodeRef } = useDroppable({
    id: 'backlog',
    data: {
      type: 'backlog',
      id: null,
    },
  });

  const handleAddTodo = () => {
    const trimmed = newTodoText.trim();
    if (trimmed) {
      onAddTodo(trimmed);
      setNewTodoText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Prevent duplicate submission during IME composition (Korean, Japanese, etc.)
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === 'Enter') {
      handleAddTodo();
    }
  };

  return (
    <div className="w-48 flex-shrink-0 flex flex-col bg-slate-50 rounded-xl border border-slate-200 p-3 mr-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">
          할 일 목록
        </h3>
        {totalCount > 0 && (
          <span className="text-xs text-slate-500">
            {completedCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Add Todo Input - 상단에 배치 */}
      <div className="flex items-center gap-1 mb-3 pb-2 border-b border-slate-200">
        <input
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="+ 새 할 일"
          className="
            flex-1 text-xs text-slate-600 placeholder:text-slate-400
            bg-white border border-slate-200 rounded px-2 py-1.5
            focus:outline-none focus:ring-1 focus:ring-slate-400
          "
        />
        {newTodoText.trim() && (
          <button
            onClick={handleAddTodo}
            className="
              text-xs text-white bg-slate-600 hover:bg-slate-700
              px-2 py-1.5 rounded transition-colors
            "
          >
            추가
          </button>
        )}
      </div>

      {/* Import daily habits */}
      {allDailyHabits.length > 0 && (
        <div className="mb-2 pb-2 border-b border-slate-200">
          <button
            onClick={handleImportHabits}
            className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded
                     bg-indigo-50 text-indigo-600 text-xs font-medium
                     hover:bg-indigo-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            습관 불러오기
          </button>
          {importFeedback && (
            <p className="text-[10px] text-indigo-500 text-center mt-1 animate-pulse">
              {importFeedback}
            </p>
          )}
        </div>
      )}

      {/* Todo List */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 overflow-y-auto space-y-0.5 rounded-md p-1 -m-1 transition-colors
          ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}
        `}
      >
        {todos.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            할 일을 추가하고<br />블록으로 드래그하세요
          </p>
        ) : (
          todos.map((todo) => (
            <DraggableTodoItem
              key={todo.id}
              todo={todo}
              sourceType="backlog"
              sourceId={null}
              onToggle={() => onToggleTodo(todo.id)}
              onUpdate={(text) => onUpdateTodo(todo.id, text)}
              onDelete={() => onDeleteTodo(todo.id)}
              onColorChange={onColorChange ? (color) => onColorChange(todo.id, color) : undefined}
              onDuplicate={onDuplicate ? () => onDuplicate(todo.id) : undefined}
            />
          ))
        )}

        {todos.length > 0 && isOver && (
          <div className="text-xs text-blue-400 text-center py-2">
            여기에 놓으세요
          </div>
        )}
      </div>
    </div>
  );
}
