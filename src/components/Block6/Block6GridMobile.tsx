'use client';

import React, { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { useBlock6Store } from '@/hooks/useBlock6';
import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  BlockNumber,
  DayOfWeek,
  TIME_OF_DAY_LABELS,
  TimeOfDay,
  TodoItem,
  BLOCK_TIME_OF_DAY,
} from '@/types/block6';
import { BlockCard } from './BlockCard';
import { TodoBacklog } from './TodoBacklog';
import { WeeklyFocusRef } from './WeeklyFocusRef';
import { useHolidayStore } from '@/hooks/useHolidays';
import { getHolidaysInWeek, toIsoDate } from '@/lib/holidays';
import { getWeekDates } from '@/lib/weekUtils';

const BLOCK_NUMBERS: BlockNumber[] = [1, 2, 3, 4, 5, 6];

const TIME_STYLES: Record<TimeOfDay, { bg: string; bar: string; text: string }> = {
  morning: { bg: 'bg-amber-50', bar: 'bg-amber-400', text: 'text-amber-800' },
  afternoon: { bg: 'bg-sky-50', bar: 'bg-sky-400', text: 'text-sky-800' },
  evening: { bg: 'bg-violet-50', bar: 'bg-violet-400', text: 'text-violet-800' },
};

/**
 * Block6의 모바일 전용 레이아웃.
 * - 상단 아코디언: 주간 포커스 / 백로그 / 고정 할일 (접고 펼침)
 * - 요일 탭: 월~일 (오늘 강조)
 * - 본문: 선택한 요일의 6블록 세로 스택
 *
 * 데스크탑 Block6Grid와 모바일 Block6GridMobile은 별도 마크업.
 * 한 곳을 수정해도 다른 쪽에 영향이 가지 않도록 분리.
 */
export function Block6GridMobile() {
  const currentBlock6Id = useBlock6Store((state) => state.currentBlock6Id);
  const block6Plans = useBlock6Store((state) => state.block6Plans);
  const data = block6Plans.find((p) => p.id === currentBlock6Id) || null;

  const addTodo = useBlock6Store((state) => state.addTodo);
  const toggleTodo = useBlock6Store((state) => state.toggleTodo);
  const updateTodo = useBlock6Store((state) => state.updateTodo);
  const deleteTodo = useBlock6Store((state) => state.deleteTodo);
  const addBacklogTodo = useBlock6Store((state) => state.addBacklogTodo);
  const toggleBacklogTodo = useBlock6Store((state) => state.toggleBacklogTodo);
  const updateBacklogTodo = useBlock6Store((state) => state.updateBacklogTodo);
  const deleteBacklogTodo = useBlock6Store((state) => state.deleteBacklogTodo);
  const updateBacklogTodoColor = useBlock6Store((state) => state.updateBacklogTodoColor);
  const duplicateBacklogTodo = useBlock6Store((state) => state.duplicateBacklogTodo);
  const updateTodoColor = useBlock6Store((state) => state.updateTodoColor);
  const duplicateTodo = useBlock6Store((state) => state.duplicateTodo);
  const moveTodo = useBlock6Store((state) => state.moveTodo);
  const reorderBlockTodo = useBlock6Store((state) => state.reorderBlockTodo);
  const reorderBacklogTodo = useBlock6Store((state) => state.reorderBacklogTodo);

  const manualHolidays = useHolidayStore((s) => s.manualHolidays);
  const toggleManualHoliday = useHolidayStore((s) => s.toggleManualHoliday);

  // 오늘 요일을 기본 선택, 없으면 월요일
  const todayDayOfWeek = new Date().getDay();
  const TODAY_INDEX_MAP: Record<number, DayOfWeek> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
  };
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(TODAY_INDEX_MAP[todayDayOfWeek] || 'mon');
  const [activeTodo, setActiveTodo] = useState<TodoItem | null>(null);

  // 아코디언 펼침 상태
  const [showSidebar, setShowSidebar] = useState(false);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400 px-4 text-center text-sm">
        Block 6 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const weekDates: Date[] | null =
    data.year && data.month && data.week
      ? getWeekDates(data.year, data.month, data.week)
      : null;
  const holidayMap = weekDates ? getHolidaysInWeek(weekDates, manualHolidays) : {};
  const dateByDay: Record<DayOfWeek, Date | null> = weekDates
    ? {
        mon: weekDates[0],
        tue: weekDates[1],
        wed: weekDates[2],
        thu: weekDates[3],
        fri: weekDates[4],
        sat: weekDates[5],
        sun: weekDates[6],
      }
    : { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

  const getBlock = (day: DayOfWeek, blockNumber: BlockNumber) => {
    return data.blocks.find((b) => b.day === day && b.blockNumber === blockNumber);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const todo = event.active.data.current?.todo as TodoItem | undefined;
    if (todo) setActiveTodo(todo);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTodo(null);
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData) return;

    const todoId = active.id as string;
    const sourceType = activeData.sourceType as 'backlog' | 'block';
    const sourceId = activeData.sourceId as string | null;
    const isOverTodo = overData.type === 'todo';

    if (isOverTodo) {
      const overSourceType = overData.sourceType as 'backlog' | 'block';
      const overSourceId = overData.sourceId as string | null;

      if (sourceType === overSourceType && sourceId === overSourceId) {
        const overId = over.id as string;
        if (todoId === overId) return;

        if (sourceType === 'block' && sourceId) {
          const block = data.blocks.find((b) => b.id === sourceId);
          if (!block) return;
          const fromIndex = block.todos.findIndex((t) => t.id === todoId);
          const toIndex = block.todos.findIndex((t) => t.id === overId);
          if (fromIndex !== -1 && toIndex !== -1) reorderBlockTodo(sourceId, fromIndex, toIndex);
        } else if (sourceType === 'backlog') {
          const fromIndex = data.backlog.findIndex((t) => t.id === todoId);
          const toIndex = data.backlog.findIndex((t) => t.id === overId);
          if (fromIndex !== -1 && toIndex !== -1) reorderBacklogTodo(fromIndex, toIndex);
        }
        return;
      }
      moveTodo(todoId, sourceType, sourceId, overSourceType, overSourceId);
    } else {
      const destType = overData.type as 'backlog' | 'block';
      const destId = overData.id as string | null;
      if (sourceType === destType && sourceId === destId) return;
      moveTodo(todoId, sourceType, sourceId, destType, destId);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="w-full max-w-screen-md mx-auto px-2 flex flex-col gap-3">
        {/* 아코디언 헤더: 주간 포커스 + 백로그 + 고정 할일 */}
        <button
          onClick={() => setShowSidebar((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                   bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            주간 포커스 · 백로그 · 고정 할일
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${showSidebar ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showSidebar && (
          <div className="flex flex-col gap-3 pb-2 border-b border-slate-200">
            <WeeklyFocusRef planYear={data.year} planMonth={data.month} planWeek={data.week} />
            {/* TodoBacklog는 데스크탑 사이드바 폭(w-48)을 가정하지만 모바일은 w-full로 확장 */}
            <div className="w-full">
              <TodoBacklog
                todos={data.backlog}
                onAddTodo={addBacklogTodo}
                onToggleTodo={toggleBacklogTodo}
                onUpdateTodo={updateBacklogTodo}
                onDeleteTodo={deleteBacklogTodo}
                onColorChange={updateBacklogTodoColor}
                onDuplicate={duplicateBacklogTodo}
              />
            </div>
          </div>
        )}

        {/* 요일 탭 — 7일 가로 스크롤 가능 */}
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="flex gap-1.5 min-w-min">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDay === day;
              const isWeekend = day === 'sat' || day === 'sun';
              const date = dateByDay[day];
              const iso = date ? toIsoDate(date) : '';
              const holiday = iso ? holidayMap[iso] : undefined;
              const isHoliday = !!holiday;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`
                    flex-shrink-0 flex flex-col items-center justify-center
                    min-w-[44px] h-14 rounded-lg
                    text-xs font-bold transition-colors
                    ${isSelected
                      ? 'bg-slate-800 text-white'
                      : isHoliday
                      ? 'bg-red-50 text-red-600'
                      : isWeekend
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-white text-slate-600 border border-slate-200'}
                  `}
                >
                  <span>{DAY_LABELS[day]}</span>
                  {date && (
                    <span className="text-[10px] font-normal opacity-80 leading-none mt-0.5">
                      {date.getMonth() + 1}/{date.getDate()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 선택된 요일의 휴일 표시 */}
        {(() => {
          const date = dateByDay[selectedDay];
          if (!date) return null;
          const iso = toIsoDate(date);
          const holiday = holidayMap[iso];
          if (!holiday) return null;
          return (
            <div
              className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs flex items-center justify-between"
              onClick={() => {
                if (holiday.source === 'auto') return;
                toggleManualHoliday(date);
              }}
            >
              <span className="font-medium">{holiday.name || '휴일'}</span>
              <span className="text-[10px] text-red-500">
                {holiday.source === 'auto' ? '공휴일' : '수동 · 탭하여 해제'}
              </span>
            </div>
          );
        })()}

        {/* 선택된 요일의 6블록 세로 스택 */}
        <div className="flex flex-col gap-2">
          {BLOCK_NUMBERS.map((blockNumber) => {
            const timeOfDay = BLOCK_TIME_OF_DAY[blockNumber];
            const style = TIME_STYLES[timeOfDay];
            const isFirstInGroup = blockNumber === 1 || blockNumber === 3 || blockNumber === 5;
            const block = getBlock(selectedDay, blockNumber);
            if (!block) return null;

            return (
              <React.Fragment key={blockNumber}>
                {isFirstInGroup && (
                  <div
                    className={`
                      flex items-center gap-2 px-3 py-1.5 rounded-lg
                      ${style.bg} ${style.text}
                    `}
                  >
                    <div className={`w-1 h-4 rounded-full ${style.bar}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {TIME_OF_DAY_LABELS[timeOfDay]}
                    </span>
                    <span className="text-[10px] opacity-70 ml-auto">
                      Block {blockNumber}–{blockNumber + 1}
                    </span>
                  </div>
                )}
                <BlockCard
                  block={block}
                  onAddTodo={(text) => addTodo(block.id, text)}
                  onToggleTodo={(todoId) => toggleTodo(block.id, todoId)}
                  onUpdateTodo={(todoId, text) => updateTodo(block.id, todoId, text)}
                  onDeleteTodo={(todoId) => deleteTodo(block.id, todoId)}
                  onTodoColorChange={(todoId, color) => updateTodoColor(block.id, todoId, color)}
                  onDuplicateTodo={(todoId) => duplicateTodo(block.id, todoId)}
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeTodo ? (
          <div className="bg-white shadow-lg rounded-md px-3 py-2 text-sm text-slate-700 border border-slate-200 font-medium">
            {activeTodo.text}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
