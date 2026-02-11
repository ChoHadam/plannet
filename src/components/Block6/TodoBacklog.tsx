'use client';

import { useState, KeyboardEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { TodoItem as TodoItemType } from '@/types/block6';
import { DraggableTodoItem } from './DraggableTodoItem';

interface TodoBacklogProps {
  todos: TodoItemType[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onUpdateTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
}

export function TodoBacklog({
  todos,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
}: TodoBacklogProps) {
  const [newTodoText, setNewTodoText] = useState('');
  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;

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

      {/* Todo List */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 overflow-y-auto space-y-0.5 rounded-md p-1 -m-1 transition-colors
          ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}
        `}
      >
        {todos.length === 0 ? (
          <p className="text-[10px] text-slate-400 text-center py-4">
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
