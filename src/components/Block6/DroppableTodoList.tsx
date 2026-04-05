'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TodoItem as TodoItemType, TodoColor } from '@/types/block6';
import { DraggableTodoItem } from './DraggableTodoItem';

interface DroppableTodoListProps {
  droppableId: string;
  sourceType: 'backlog' | 'block';
  sourceId: string | null;
  todos: TodoItemType[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onUpdateTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onColorChange?: (todoId: string, color: TodoColor) => void;
  onDuplicate?: (todoId: string) => void;
  placeholder?: string;
}

export function DroppableTodoList({
  droppableId,
  sourceType,
  sourceId,
  todos,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onColorChange,
  onDuplicate,
  placeholder = '+ 할 일 추가',
}: DroppableTodoListProps) {
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: {
      type: sourceType,
      id: sourceId,
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
    // Prevent duplicate submission during IME composition (Korean, Japanese, etc.)
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === 'Enter') {
      handleAddTodo();
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-md transition-colors p-1 -m-1
        ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}
      `}
    >
      <SortableContext items={todos.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {todos.map((todo) => (
            <DraggableTodoItem
              key={todo.id}
              todo={todo}
              sourceType={sourceType}
              sourceId={sourceId}
              onToggle={() => onToggleTodo(todo.id)}
              onUpdate={(text) => onUpdateTodo(todo.id, text)}
              onDelete={() => onDeleteTodo(todo.id)}
              onColorChange={onColorChange ? (color) => onColorChange(todo.id, color) : undefined}
              onDuplicate={onDuplicate ? () => onDuplicate(todo.id) : undefined}
            />
          ))}

          {todos.length === 0 && isOver && (
            <div className="text-xs text-blue-400 text-center py-2">
              여기에 놓으세요
            </div>
          )}
        </div>
      </SortableContext>

      {/* Add todo input */}
      <div className="mt-1 flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="
            flex-1 text-xs text-slate-500 placeholder:text-slate-400
            bg-transparent border-none outline-none
            focus:placeholder:text-slate-300
          "
        />
        {newTodoText.trim() && (
          <button
            onClick={handleAddTodo}
            className="
              text-xs text-slate-400 hover:text-slate-600
              transition-colors
            "
          >
            추가
          </button>
        )}
      </div>
    </div>
  );
}
