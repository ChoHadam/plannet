'use client';

import { BlockData, BLOCK_TIME_OF_DAY, TimeOfDay, TodoColor } from '@/types/block6';
import { BLOCK6_TIME_COLORS } from '@/lib/constants';
import { DroppableTodoList } from './DroppableTodoList';

interface BlockCardProps {
  block: BlockData;
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onUpdateTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onTodoColorChange?: (todoId: string, color: TodoColor) => void;
  onDuplicateTodo?: (todoId: string) => void;
}

export function BlockCard({
  block,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onTodoColorChange,
  onDuplicateTodo,
}: BlockCardProps) {
  const timeOfDay: TimeOfDay = BLOCK_TIME_OF_DAY[block.blockNumber];
  const backgroundColor = block.color || BLOCK6_TIME_COLORS[timeOfDay];

  // Calculate completion rate
  const completedCount = block.todos.filter((t) => t.completed).length;
  const totalCount = block.todos.length;

  return (
    <div
      className="
        flex flex-col p-2 rounded-lg border border-slate-200/50
        transition-all hover:shadow-sm min-h-[120px]
      "
      style={{ backgroundColor }}
    >
      {/* Completion indicator (only show if there are todos) */}
      {totalCount > 0 && (
        <div className="flex justify-end mb-1">
          <span
            className={`
              text-[10px] font-medium px-1.5 py-0.5 rounded-full
              ${completedCount === totalCount
                ? 'bg-green-100 text-green-700'
                : 'bg-white/60 text-slate-500'}
            `}
          >
            {completedCount}/{totalCount}
          </span>
        </div>
      )}

      {/* Todo List */}
      <DroppableTodoList
        droppableId={`block-${block.id}`}
        sourceType="block"
        sourceId={block.id}
        todos={block.todos}
        onAddTodo={onAddTodo}
        onToggleTodo={onToggleTodo}
        onUpdateTodo={onUpdateTodo}
        onDeleteTodo={onDeleteTodo}
        onColorChange={onTodoColorChange}
        onDuplicate={onDuplicateTodo}
      />
    </div>
  );
}
