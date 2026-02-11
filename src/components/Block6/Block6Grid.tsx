'use client';

import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
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
import { BLOCK6_TIME_COLORS, BLOCK6_TIME_BORDER_COLORS } from '@/lib/constants';
import { BlockCard } from './BlockCard';
import { TodoBacklog } from './TodoBacklog';

// All block numbers in order
const BLOCK_NUMBERS: BlockNumber[] = [1, 2, 3, 4, 5, 6];

// Group blocks by time of day for legend
const TIME_GROUPS: { time: TimeOfDay; label: string }[] = [
  { time: 'morning', label: TIME_OF_DAY_LABELS.morning },
  { time: 'afternoon', label: TIME_OF_DAY_LABELS.afternoon },
  { time: 'evening', label: TIME_OF_DAY_LABELS.evening },
];

export function Block6Grid() {
  const [activeTodo, setActiveTodo] = useState<TodoItem | null>(null);

  // Get data directly from store state to ensure reactivity
  const currentBlock6Id = useBlock6Store((state) => state.currentBlock6Id);
  const block6Plans = useBlock6Store((state) => state.block6Plans);
  const data = block6Plans.find((p) => p.id === currentBlock6Id) || null;

  // Block operations
  const addTodo = useBlock6Store((state) => state.addTodo);
  const toggleTodo = useBlock6Store((state) => state.toggleTodo);
  const updateTodo = useBlock6Store((state) => state.updateTodo);
  const deleteTodo = useBlock6Store((state) => state.deleteTodo);

  // Backlog operations
  const addBacklogTodo = useBlock6Store((state) => state.addBacklogTodo);
  const toggleBacklogTodo = useBlock6Store((state) => state.toggleBacklogTodo);
  const updateBacklogTodo = useBlock6Store((state) => state.updateBacklogTodo);
  const deleteBacklogTodo = useBlock6Store((state) => state.deleteBacklogTodo);
  const updateBacklogTodoColor = useBlock6Store((state) => state.updateBacklogTodoColor);
  const duplicateBacklogTodo = useBlock6Store((state) => state.duplicateBacklogTodo);

  // Todo color and duplicate (for blocks)
  const updateTodoColor = useBlock6Store((state) => state.updateTodoColor);
  const duplicateTodo = useBlock6Store((state) => state.duplicateTodo);

  // Drag and drop
  const moveTodo = useBlock6Store((state) => state.moveTodo);

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
    if (todo) {
      setActiveTodo(todo);
    }
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
    const destType = overData.type as 'backlog' | 'block';
    const destId = overData.id as string | null;

    // Don't do anything if dropped in the same place
    if (sourceType === destType && sourceId === destId) return;

    moveTodo(todoId, sourceType, sourceId, destType, destId);
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex w-full max-w-7xl mx-auto">
        {/* Backlog (Left Sidebar) */}
        <TodoBacklog
          todos={data.backlog}
          onAddTodo={addBacklogTodo}
          onToggleTodo={toggleBacklogTodo}
          onUpdateTodo={updateBacklogTodo}
          onDeleteTodo={deleteBacklogTodo}
          onColorChange={updateBacklogTodoColor}
          onDuplicate={duplicateBacklogTodo}
        />

        {/* Main Grid - Column-based layout */}
        <div className="flex-1 overflow-x-auto">
          {/* Grid container: row labels column + 7 day columns */}
          <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 min-w-[800px]">
            {/* Header Row */}
            {/* Empty corner for row labels */}
            <div className="h-8" />
            {/* Day Headers */}
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="
                  h-8 flex items-center justify-center
                  text-sm font-semibold text-slate-600
                  bg-slate-100 rounded-lg
                "
              >
                {DAY_LABELS[day]}
              </div>
            ))}

            {/* Block Rows */}
            {BLOCK_NUMBERS.map((blockNumber) => {
              const timeOfDay = BLOCK_TIME_OF_DAY[blockNumber];
              const isFirstInGroup = blockNumber === 1 || blockNumber === 3 || blockNumber === 5;

              return (
                <>
                  {/* Row Label */}
                  <div
                    key={`label-${blockNumber}`}
                    className="
                      flex flex-col items-center justify-center
                      text-xs font-medium rounded-lg px-1 py-2 min-h-[120px]
                    "
                    style={{
                      backgroundColor: BLOCK6_TIME_COLORS[timeOfDay],
                      borderLeft: `3px solid ${BLOCK6_TIME_BORDER_COLORS[timeOfDay]}`,
                    }}
                  >
                    {isFirstInGroup && (
                      <span className="text-slate-500 mb-0.5">
                        {TIME_OF_DAY_LABELS[timeOfDay]}
                      </span>
                    )}
                    <span className="text-slate-400">Block {blockNumber}</span>
                  </div>

                  {/* Block Cards for each day */}
                  {DAYS_OF_WEEK.map((day) => {
                    const block = getBlock(day, blockNumber);
                    if (!block) return <div key={`${day}-${blockNumber}`} />;

                    return (
                      <div key={`${day}-${blockNumber}`}>
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
                </>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
            {TIME_GROUPS.map(({ time, label }) => (
              <div key={time} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: BLOCK6_TIME_COLORS[time] }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTodo ? (
          <div className="bg-white shadow-lg rounded px-2 py-1 text-xs text-slate-600 border border-slate-200">
            {activeTodo.text}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
