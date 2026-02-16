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

  // Calculate completion rate
  const completedCount = block.todos.filter((t) => t.completed).length;
  const totalCount = block.todos.length;

  return (
    <div
      className="
        flex flex-col p-2 rounded-lg border border-slate-200
        transition-all hover:shadow-sm min-h-[120px] bg-[#FAF9F6]
      "
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
