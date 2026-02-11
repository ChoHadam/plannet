'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { TodoItem as TodoItemType } from '@/types/block6';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: TodoItemType[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onUpdateTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  maxTodos?: number;
}

export function TodoList({
  todos,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  maxTodos = 5,
}: TodoListProps) {
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const canAddMore = todos.length < maxTodos;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={() => onToggleTodo(todo.id)}
            onUpdate={(text) => onUpdateTodo(todo.id, text)}
            onDelete={() => onDeleteTodo(todo.id)}
          />
        ))}
      </div>

      {canAddMore && (
        <div className="mt-1 flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="+ 할 일 추가"
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
      )}
    </div>
  );
}
