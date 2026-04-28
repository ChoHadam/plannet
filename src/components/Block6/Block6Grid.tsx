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

const BLOCK_NUMBERS: BlockNumber[] = [1, 2, 3, 4, 5, 6];

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
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex w-full max-w-screen-2xl mx-auto gap-4">
        {/* Left Sidebar */}
        <div className="w-48 flex flex-col gap-3 flex-shrink-0">
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
        <div className="flex-1 overflow-x-auto">
          <div className="bg-slate-50 p-3 rounded-2xl">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1.5 min-w-[860px]">
              {/* Header Row */}
              <div />
              {DAYS_OF_WEEK.map((day) => {
                const isWeekend = day === 'sat' || day === 'sun';
                return (
                  <div
                    key={day}
                    className={`
                      h-9 flex items-center justify-center
                      text-xs font-bold uppercase tracking-wider rounded-lg
                      ${isWeekend ? 'text-slate-400 bg-slate-100' : 'text-slate-500 bg-white'}
                    `}
                  >
                    {DAY_LABELS[day]}
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

                      return (
                        <div
                          key={`${day}-${blockNumber}`}
                          className={`rounded-lg ${isWeekend ? 'bg-slate-100/60' : ''}`}
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

      {/* Drag Overlay */}
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
