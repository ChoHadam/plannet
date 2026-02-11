'use client';

import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TodoItem as TodoItemType } from '@/types/block6';

interface DraggableTodoItemProps {
  todo: TodoItemType;
  sourceType: 'backlog' | 'block';
  sourceId: string | null; // blockId for block, null for backlog
  onToggle: () => void;
  onUpdate: (text: string) => void;
  onDelete: () => void;
}

export function DraggableTodoItem({
  todo,
  sourceType,
  sourceId,
  onToggle,
  onUpdate,
  onDelete,
}: DraggableTodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
    data: {
      type: 'todo',
      todo,
      sourceType,
      sourceId,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditText(todo.text);
  }, [todo.text]);

  const handleSave = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onUpdate(trimmed);
    } else {
      setEditText(todo.text);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditText(todo.text);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-start gap-1.5 py-0.5 rounded
        ${isDragging ? 'z-50 bg-white shadow-lg' : ''}
      `}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="
          flex-shrink-0 w-4 h-4 mt-0.5 cursor-grab active:cursor-grabbing
          text-slate-300 hover:text-slate-500 transition-colors
          opacity-0 group-hover:opacity-100
        "
        title="드래그하여 이동"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-full h-full"
        >
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`
          flex-shrink-0 w-4 h-4 mt-0.5 rounded border transition-colors
          ${todo.completed
            ? 'bg-slate-500 border-slate-500'
            : 'border-slate-300 hover:border-slate-400'}
        `}
      >
        {todo.completed && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-full h-full p-0.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Text */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 text-xs bg-white border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      ) : (
        <span
          onClick={() => setIsEditing(true)}
          className={`
            flex-1 text-xs cursor-text break-words
            ${todo.completed ? 'line-through text-slate-400' : 'text-slate-600'}
          `}
        >
          {todo.text}
        </span>
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="
          flex-shrink-0 opacity-0 group-hover:opacity-100
          w-4 h-4 rounded flex items-center justify-center
          text-slate-400 hover:text-red-500 hover:bg-red-50
          transition-all
        "
        title="삭제"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
