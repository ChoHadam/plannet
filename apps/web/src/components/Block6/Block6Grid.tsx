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
import { Block6GridMobile } from './Block6GridMobile';
import { useHolidayStore } from '@/hooks/useHolidays';
import { getHolidaysInWeek, toIsoDate } from '@/lib/holidays';
import { getWeekDates } from '@/lib/weekUtils';

const BLOCK_NUMBERS: BlockNumber[] = [1, 2, 3, 4, 5, 6];

// 레이아웃 토큰 — 한 곳에서만 정의해서 사이드바/그리드 디자인이 같이 바뀌도록.
// 한 값을 바꿔도 다른 영역에 영향이 가지 않도록 의미 단위로 분리해 둠.
const LAYOUT = {
  // 사이드바와 메인 그리드 카드의 공통 표면(surface) 스타일
  surface: 'bg-slate-50 rounded-2xl',
  surfacePadding: 'p-4',
  // 사이드바 ↔ 메인 사이 간격
  outerGap: 'gap-6',
  // 그리드 셀 사이 간격
  gridGap: 'gap-2',
  // 그리드 최소 너비 (월~일 컬럼이 잘리지 않게)
  gridMinWidth: 'min-w-[860px]',
  // 주말(토/일) 강조 배경 — 헤더와 셀 모두 동일한 톤 사용
  weekendBg: 'bg-slate-100',
  weekdayHeaderBg: 'bg-white',
} as const;

// 시간대별 스타일
const TIME_STYLES: Record<TimeOfDay, { bg: string; bar: string; text: string; icon: React.ReactNode }> = {
  morning: {
    bg: 'bg-amber-50',
    bar: 'bg-amber-400',
    text: 'text-amber-800',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    ),
  },
  afternoon: {
    bg: 'bg-sky-50',
    bar: 'bg-sky-400',
    text: 'text-sky-800',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 8a4 4 0 0 0 0 8" fill="currentColor" opacity="0.15" />
      </svg>
    ),
  },
  evening: {
    bg: 'bg-violet-50',
    bar: 'bg-violet-400',
    text: 'text-violet-800',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
};

export function Block6Grid() {
  const [activeTodo, setActiveTodo] = useState<TodoItem | null>(null);

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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400">
        Block 6 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const getBlock = (day: DayOfWeek, blockNumber: BlockNumber) => {
    return data.blocks.find((b) => b.day === day && b.blockNumber === blockNumber);
  };

  // 요일 헤더에 표시할 날짜 + 공휴일 정보 (week 메타데이터가 있을 때만)
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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const todo = active.data.current?.todo as TodoItem | undefined;
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
    <>
      {/* 모바일 전용 레이아웃 (요일 탭 + 아코디언). 데스크탑에서는 hidden. */}
      <div className="md:hidden">
        <Block6GridMobile />
      </div>

      {/* 데스크탑 그리드. 모바일에서는 hidden. */}
      <div className="hidden md:block">
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`flex w-full max-w-screen-2xl mx-auto items-start ${LAYOUT.outerGap}`}>
        {/* Left Sidebar (sticky to viewport so click targets stay in place) */}
        {/* TODO: top-4/2rem are tied to <main>'s py-8. If another template needs the same sticky-sidebar pattern, extract to a tailwind theme spacing token. */}
        <div className="w-48 flex flex-col gap-3 flex-shrink-0 sticky top-4 h-[calc(100vh-2rem)]">
          <WeeklyFocusRef planYear={data.year} planMonth={data.month} planWeek={data.week} />
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

        {/* Main Grid */}
        <div className="flex-1 min-w-0 overflow-x-auto pb-3 overscroll-x-contain">
          <div className="min-w-full pr-4">
            <div className={`${LAYOUT.surface} ${LAYOUT.surfacePadding} ${LAYOUT.gridMinWidth} w-full`}>
              <div className={`grid grid-cols-[56px_repeat(7,minmax(0,1fr))] ${LAYOUT.gridGap}`}>
              {/* Header Row */}
              <div />
              {DAYS_OF_WEEK.map((day) => {
                const isWeekend = day === 'sat' || day === 'sun';
                const date = dateByDay[day];
                const iso = date ? toIsoDate(date) : '';
                const holiday = iso ? holidayMap[iso] : undefined;
                const isAuto = holiday?.source === 'auto';
                const isManualHoliday = holiday?.source === 'manual';
                const handleContextMenu = (e: React.MouseEvent) => {
                  if (!date) return;
                  e.preventDefault();
                  if (isAuto) return; // 자동 휴일은 read-only
                  toggleManualHoliday(date);
                };
                return (
                  <div
                    key={day}
                    onContextMenu={handleContextMenu}
                    title={
                      holiday?.name
                        ? holiday.name + (isAuto ? ' · 공휴일' : ' · 수동')
                        : date
                          ? '우클릭으로 수동 휴일 토글'
                          : ''
                    }
                    className={`
                      h-12 flex flex-col items-center justify-center
                      text-xs font-bold uppercase tracking-wider rounded-lg
                      transition-colors
                      ${isAuto ? 'bg-red-50 text-red-600 cursor-not-allowed' : ''}
                      ${isManualHoliday ? 'bg-red-100 text-red-700 cursor-pointer' : ''}
                      ${!holiday && isWeekend ? `text-slate-400 ${LAYOUT.weekendBg}` : ''}
                      ${!holiday && !isWeekend ? `text-slate-500 ${LAYOUT.weekdayHeaderBg}` : ''}
                    `}
                  >
                    <span>{DAY_LABELS[day]}</span>
                    {date && (
                      <span className="text-[10px] font-normal opacity-70 leading-none mt-0.5">
                        {date.getMonth() + 1}/{date.getDate()}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Block Rows */}
              {BLOCK_NUMBERS.map((blockNumber) => {
                const timeOfDay = BLOCK_TIME_OF_DAY[blockNumber];
                const style = TIME_STYLES[timeOfDay];
                const isFirstInGroup = blockNumber === 1 || blockNumber === 3 || blockNumber === 5;

                return (
                  <React.Fragment key={blockNumber}>
                    {/* Time label — spans 2 rows for first block in group */}
                    {isFirstInGroup ? (
                      <div
                        className={`
                          row-span-2 flex flex-col items-center justify-center
                          rounded-xl relative overflow-hidden
                          ${style.bg} ${style.text}
                        `}
                      >
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} />
                        <span className="mb-1">{style.icon}</span>
                        <span className="text-[10px] font-bold leading-tight">
                          {TIME_OF_DAY_LABELS[timeOfDay]}
                        </span>
                      </div>
                    ) : null}

                    {/* Block Cards */}
                    {DAYS_OF_WEEK.map((day) => {
                      const block = getBlock(day, blockNumber);
                      if (!block) return <div key={`${day}-${blockNumber}`} />;

                      const isWeekend = day === 'sat' || day === 'sun';
                      const date = dateByDay[day];
                      const iso = date ? toIsoDate(date) : '';
                      const isHolidayCol = !!(iso && holidayMap[iso]);

                      return (
                        <div
                          key={`${day}-${blockNumber}`}
                          className={`
                            rounded-lg
                            ${isWeekend && !isHolidayCol ? LAYOUT.weekendBg : ''}
                            ${isHolidayCol ? 'ring-1 ring-red-200 bg-red-50/30' : ''}
                          `}
                        >
                          <BlockCard
                            block={block}
                            onAddTodo={(text) => addTodo(block.id, text)}
                            onToggleTodo={(todoId) => toggleTodo(block.id, todoId)}
                            onUpdateTodo={(todoId, text) => updateTodo(block.id, todoId, text)}
                            onDeleteTodo={(todoId) => deleteTodo(block.id, todoId)}
                            onTodoColorChange={(todoId, color) => updateTodoColor(block.id, todoId, color)}
                            onDuplicateTodo={(todoId) => duplicateTodo(block.id, todoId)}
                          />
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTodo ? (
          <div className="bg-white shadow-lg rounded-md px-3 py-2 text-sm text-slate-700 border border-slate-200 font-medium">
            {activeTodo.text}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
      </div>
    </>
  );
}
