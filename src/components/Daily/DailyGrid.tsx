'use client';

import { useState, useRef, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDailyStore } from '@/hooks/useDaily';
import { useMandalartStore } from '@/hooks/useMandalart';
import { extractDailyHabits } from '@/lib/mandalartIntegration';
import { DailyTodo, DAY_LABELS } from '@/types/daily';
import { RecurringTodosInline } from '../RecurringTodos';

// ---- Sortable Todo Item ----

interface SortableTodoItemProps {
  todo: DailyTodo;
  onToggle: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  isEditing: boolean;
  editText: string;
  onEditChange: (text: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function SortableTodoItem({
  todo,
  onToggle,
  onDelete,
  onStartEdit,
  isEditing,
  editText,
  onEditChange,
  onEditSave,
  onEditCancel,
}: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEditSave();
    } else if (e.key === 'Escape') {
      onEditCancel();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-3 p-4
        hover:bg-slate-50 transition-colors
        ${isDragging ? 'z-50 bg-white shadow-lg' : ''}
      `}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
        title="드래그하여 순서 변경"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`
          w-5 h-5 rounded-full border-2 flex items-center justify-center
          transition-colors flex-shrink-0
          ${todo.completed
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-slate-300 hover:border-emerald-500'}
        `}
      >
        {todo.completed && (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        )}
      </button>

      {/* Text */}
      {isEditing ? (
        <input
          type="text"
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onEditSave}
          autoFocus
          className="flex-1 px-2 py-1 rounded border border-emerald-500
                   text-sm text-slate-700 focus:outline-none"
        />
      ) : (
        <span
          onClick={onStartEdit}
          className={`
            flex-1 text-sm cursor-text
            ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'}
          `}
        >
          {todo.text}
        </span>
      )}

      {/* Source badge */}
      {todo.sourceType && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
          {todo.sourceType === 'monthly' ? '월간' :
           todo.sourceType === 'block6' ? 'Block6' : '만다라트'}
        </span>
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 rounded
                 text-slate-400 hover:text-red-500 hover:bg-red-50
                 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

// ---- Completed Todo Item (no drag) ----

function CompletedTodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: DailyTodo;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
      {/* Spacer (same width as drag handle) */}
      <div className="w-[14px] flex-shrink-0" />

      {/* Checkbox */}
      <button
        onClick={onToggle}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center
                 transition-colors flex-shrink-0
                 bg-emerald-500 border-emerald-500 text-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>

      {/* Text */}
      <span className="flex-1 text-sm text-slate-400 line-through">{todo.text}</span>

      {/* Source badge */}
      {todo.sourceType && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
          {todo.sourceType === 'monthly' ? '월간' :
           todo.sourceType === 'block6' ? 'Block6' : '만다라트'}
        </span>
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 rounded
                 text-slate-400 hover:text-red-500 hover:bg-red-50
                 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

// ---- Main DailyGrid ----

export function DailyGrid() {
  const currentDailyId = useDailyStore((state) => state.currentDailyId);
  const dailyPlans = useDailyStore((state) => state.dailyPlans);
  const data = dailyPlans.find((p) => p.id === currentDailyId) || null;

  const navigateDay = useDailyStore((state) => state.navigateDay);
  const addTodo = useDailyStore((state) => state.addTodo);
  const updateTodo = useDailyStore((state) => state.updateTodo);
  const toggleTodo = useDailyStore((state) => state.toggleTodo);
  const deleteTodo = useDailyStore((state) => state.deleteTodo);
  const reorderTodos = useDailyStore((state) => state.reorderTodos);
  const updateMemo = useDailyStore((state) => state.updateMemo);
  const importDailyHabits = useDailyStore((state) => state.importDailyHabits);
  const mandalarts = useMandalartStore((state) => state.mandalarts);

  const [newTodoText, setNewTodoText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400">
        일간 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const date = new Date(data.year, data.month - 1, data.day);
  const dayOfWeek = DAY_LABELS[date.getDay()];

  // Split todos into active and completed
  const activeTodos = data.todos.filter((t) => !t.completed);
  const completedTodos = data.todos.filter((t) => t.completed);

  const handleAddTodo = () => {
    if (!newTodoText.trim()) return;
    addTodo(newTodoText);
    setNewTodoText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTodo();
    }
  };

  const handleStartEdit = (todoId: string, text: string) => {
    setEditingId(todoId);
    setEditText(text);
  };

  const handleSaveEdit = () => {
    if (editingId && editText.trim()) {
      updateTodo(editingId, editText);
    }
    setEditingId(null);
    setEditText('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find indices in the original todos array
    const fromIndex = data.todos.findIndex((t) => t.id === active.id);
    const toIndex = data.todos.findIndex((t) => t.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTodos(fromIndex, toIndex);
    }
  };

  // Extract all daily habits from all mandalarts
  const allDailyHabits = useMemo(() => {
    return mandalarts.flatMap((m) =>
      extractDailyHabits(m).map((h) => ({ ...h, mandalartId: m.id }))
    );
  }, [mandalarts]);

  const newHabitsCount = useMemo(() => {
    if (!data) return 0;
    return allDailyHabits.filter((habit) =>
      !data.todos.some(
        (todo) =>
          todo.sourceType === 'mandalart' &&
          todo.sourceId === habit.mandalartId &&
          todo.sourceCellId === habit.cellId
      )
    ).length;
  }, [allDailyHabits, data]);

  const handleImportHabits = () => {
    if (allDailyHabits.length === 0) return;

    let totalImported = 0;
    const byMandalart = new Map<string, Array<{ text: string; cellId: string }>>();
    for (const habit of allDailyHabits) {
      const list = byMandalart.get(habit.mandalartId) || [];
      list.push({ text: habit.text, cellId: habit.cellId });
      byMandalart.set(habit.mandalartId, list);
    }

    for (const [mandalartId, habits] of byMandalart) {
      totalImported += importDailyHabits(habits, mandalartId);
    }

    if (totalImported > 0) {
      setImportFeedback(`${totalImported}개 습관 추가됨`);
    } else {
      setImportFeedback('이미 모두 추가되어 있습니다');
    }
    setTimeout(() => setImportFeedback(null), 2000);
  };

  const completedCount = data.todos.filter((t) => t.completed).length;
  const totalCount = data.todos.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      {/* Header with date navigation */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => navigateDay('prev')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          title="이전 날"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-slate-700">
          {data.year}년 {data.month}월 {data.day}일 ({dayOfWeek})
        </h2>
        <button
          onClick={() => navigateDay('next')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          title="다음 날"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-slate-500 mb-1">
            <span>진행률</span>
            <span>{completedCount}/{totalCount} ({progress}%)</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Todo list (max-height keeps recurring panel below from drifting) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[60vh]">
        {/* Add todo input */}
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="할 일을 입력하세요..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200
                       text-sm text-slate-700 placeholder:text-slate-400
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
            <button
              onClick={handleAddTodo}
              disabled={!newTodoText.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium
                       hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
            >
              추가
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {allDailyHabits.length > 0 && (
              <button
                onClick={handleImportHabits}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         bg-indigo-50 text-indigo-600 text-xs font-medium
                         hover:bg-indigo-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                습관 불러오기
                {newHabitsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] leading-none">
                    {newHabitsCount}
                  </span>
                )}
              </button>
            )}
            {importFeedback && (
              <span className="text-xs text-indigo-500 animate-pulse">
                {importFeedback}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable list area (active + completed) */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {data.todos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              아직 할 일이 없습니다
            </div>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={activeTodos.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-slate-100">
                    {activeTodos.map((todo) => (
                      <SortableTodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={() => toggleTodo(todo.id)}
                        onDelete={() => deleteTodo(todo.id)}
                        onStartEdit={() => handleStartEdit(todo.id, todo.text)}
                        isEditing={editingId === todo.id}
                        editText={editText}
                        onEditChange={setEditText}
                        onEditSave={handleSaveEdit}
                        onEditCancel={() => { setEditingId(null); setEditText(''); }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Completed items (non-draggable, separated) */}
              {completedTodos.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 sticky top-0">
                    <span className="text-xs text-slate-400">완료됨 ({completedTodos.length})</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {completedTodos.map((todo) => (
                      <CompletedTodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={() => toggleTodo(todo.id)}
                        onDelete={() => deleteTodo(todo.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recurring todos (inline) */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <RecurringTodosInline onAdd={addTodo} />
      </div>

      {/* Memo section */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-600 mb-2">메모</h3>
        <textarea
          value={data.memo}
          onChange={(e) => updateMemo(e.target.value)}
          placeholder="오늘의 메모..."
          className="w-full h-24 px-4 py-3 rounded-xl border border-slate-200
                   text-sm text-slate-700 placeholder:text-slate-400
                   focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
                   resize-none"
        />
      </div>
    </div>
  );
}
