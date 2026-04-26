'use client';

import { BlockData, TodoColor } from '@/types/block6';
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
  const completedCount = block.todos.filter((t) => t.completed).length;
  const totalCount = block.todos.length;
  const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div
      className="
        flex flex-col p-2 rounded-lg bg-white border border-transparent
        transition-all duration-200
        hover:shadow-md hover:border-slate-200
        min-h-[120px]
      "
    >
      {/* Completion badge */}
      {totalCount > 0 && (
        <div className="flex justify-end mb-1">
          <span
            className={`
              text-[10px] font-medium px-1.5 py-0.5 rounded-full
              ${percentage === 100
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'}
            `}
          >
            {completedCount}/{totalCount}
          </span>
        </div>
      )}

      {/* Todo List */}
      <div className="flex-1">
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

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="w-full bg-slate-100 rounded-full h-1 mt-2">
          <div
            className={`rounded-full h-1 transition-all duration-500 ${
              percentage === 100 ? 'bg-emerald-500' : 'bg-blue-400'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
