'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useDailyStore } from '@/hooks/useDaily';
import { useMandalartStore } from '@/hooks/useMandalart';
import { extractDailyHabits } from '@/lib/mandalartIntegration';
import { DAY_LABELS } from '@/types/daily';
import { sanitizeInput } from '@/lib/sanitize';

export function DailyGrid() {
  const currentDailyId = useDailyStore((state) => state.currentDailyId);
  const dailyPlans = useDailyStore((state) => state.dailyPlans);
  const data = dailyPlans.find((p) => p.id === currentDailyId) || null;

  const navigateDay = useDailyStore((state) => state.navigateDay);
  const addTodo = useDailyStore((state) => state.addTodo);
  const updateTodo = useDailyStore((state) => state.updateTodo);
  const toggleTodo = useDailyStore((state) => state.toggleTodo);
  const deleteTodo = useDailyStore((state) => state.deleteTodo);
  const updateMemo = useDailyStore((state) => state.updateMemo);
  const importDailyHabits = useDailyStore((state) => state.importDailyHabits);
  const mandalarts = useMandalartStore((state) => state.mandalarts);

  const [newTodoText, setNewTodoText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400">
        일간 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const date = new Date(data.year, data.month - 1, data.day);
  const dayOfWeek = DAY_LABELS[date.getDay()];

  const handleAddTodo = () => {
    if (!newTodoText.trim()) return;
    addTodo(newTodoText);
    setNewTodoText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditText('');
    }
  };

  // Extract all daily habits from all mandalarts
  const allDailyHabits = useMemo(() => {
    return mandalarts.flatMap((m) =>
      extractDailyHabits(m).map((h) => ({ ...h, mandalartId: m.id }))
    );
  }, [mandalarts]);

  // Count how many are not yet imported to this plan
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
    // Group habits by mandalart ID and import each group
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

      {/* Todo list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Add todo input */}
        <div className="p-4 border-b border-slate-100">
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
          {allDailyHabits.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
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
              {importFeedback && (
                <span className="text-xs text-indigo-500 animate-pulse">
                  {importFeedback}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Todo items */}
        <div className="divide-y divide-slate-100">
          {data.todos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              아직 할 일이 없습니다
            </div>
          ) : (
            data.todos.map((todo) => (
              <div
                key={todo.id}
                className={`
                  group flex items-center gap-3 p-4
                  hover:bg-slate-50 transition-colors
                  ${todo.completed ? 'bg-slate-50/50' : ''}
                `}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleTodo(todo.id)}
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
                {editingId === todo.id ? (
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleSaveEdit}
                    autoFocus
                    className="flex-1 px-2 py-1 rounded border border-emerald-500
                             text-sm text-slate-700 focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => handleStartEdit(todo.id, todo.text)}
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
                  onClick={() => deleteTodo(todo.id)}
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
            ))
          )}
        </div>
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
