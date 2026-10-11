'use client';

import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TodoItem as TodoItemType, TodoColor } from '@/types/block6';
import { FOCUS_RING, TODO_COLOR_BAR, TODO_COLOR_BG, TODO_COLORS, TODO_COLOR_LABELS, TOUCH_REVEAL } from '@/lib/constants';
import { useMoveTodoRequest } from './MoveTodo';

// 펼침 메뉴 항목. 터치 기기에서는 손가락 높이(약 44px)로 키운다.
const MENU_ITEM = 'w-full px-3 py-1.5 touch:py-3 text-left text-xs flex items-center gap-2';
// 행 왼쪽·오른쪽 작은 조작: 데스크탑은 14px, 터치는 28px.
const ITEM_CONTROL = 'w-3.5 h-3.5 touch:w-7 touch:h-7 flex-shrink-0';

interface DraggableTodoItemProps {
  todo: TodoItemType;
  sourceType: 'backlog' | 'block';
  sourceId: string | null;
  onToggle: () => void;
  onUpdate: (text: string) => void;
  onDelete: () => void;
  onColorChange?: (color: TodoColor) => void;
  onDuplicate?: () => void;
}

export function DraggableTodoItem({
  todo,
  sourceType,
  sourceId,
  onToggle,
  onUpdate,
  onDelete,
  onColorChange,
  onDuplicate,
}: DraggableTodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const requestMove = useMoveTodoRequest();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    data: {
      type: 'todo',
      todo,
      sourceType,
      sourceId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        setShowColorPicker(false);
      }
    };

    if (showMenu || showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu, showColorPicker]);

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

  const handleColorSelect = (color: TodoColor) => {
    onColorChange?.(color);
    setShowColorPicker(false);
    setShowMenu(false);
  };

  const handleDuplicate = () => {
    onDuplicate?.();
    setShowMenu(false);
  };

  const todoColor = todo.color || 'none';
  const barColor = TODO_COLOR_BAR[todoColor];
  const bgColor = TODO_COLOR_BG[todoColor];

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: todoColor !== 'none' ? bgColor : undefined,
        borderLeft: todoColor !== 'none' ? `3px solid ${barColor}` : undefined,
      }}
      className={`
        group flex items-center gap-1 py-1.5 px-1 rounded relative
        ${isDragging ? 'z-50 bg-white shadow-lg' : ''}
        ${todoColor !== 'none' ? 'pl-1' : ''}
      `}
    >
      {/* Hover controls container (left side). 키보드 초점이 행 안에 있거나 터치 기기면 항상 펼친다. */}
      <div className="flex items-center gap-0.5 flex-shrink-0 w-0 group-hover:w-auto group-focus-within:w-auto touch:w-auto overflow-hidden transition-all duration-150">
        {/* Drag handle */}
        <button
          {...listeners}
          {...attributes}
          className={`
            ${ITEM_CONTROL} touch:p-1.5 touch-none rounded cursor-grab active:cursor-grabbing
            text-slate-300 hover:text-slate-500 transition-colors ${FOCUS_RING}
          `}
          title="드래그하여 이동"
          aria-label={`${todo.text} 드래그하여 이동`}
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
          aria-label={`${todo.text} 완료`}
          aria-pressed={!!todo.completed}
          className={`
            w-3.5 h-3.5 touch:w-6 touch:h-6 rounded border transition-colors flex-shrink-0 ${FOCUS_RING}
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
      </div>

      {/* Completion indicator (visible when not hovering) */}
      {todo.completed && (
        <span className="text-slate-400 text-[10px] group-hover:hidden group-focus-within:hidden touch:hidden flex-shrink-0">✓</span>
      )}

      {/* Text */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          data-local-draft
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 text-xs bg-white border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      ) : (
        <span
          onClick={() => setIsEditing(true)}
          className={`
            flex-1 min-w-0 text-xs cursor-text break-words leading-tight
            ${todo.completed ? 'line-through text-slate-400' : 'text-slate-600'}
          `}
        >
          {todo.text}
        </span>
      )}

      {/* Menu button (kebab) - only on hover */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          ref={menuBtnRef}
          onClick={() => {
            if (!showMenu && menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setMenuPos({
                top: spaceBelow < 200 ? rect.top - 4 : rect.bottom + 4,
                left: rect.right,
              });
            }
            setShowMenu(!showMenu);
          }}
          className={`
            ${TOUCH_REVEAL} ${ITEM_CONTROL} relative touch-hit
            rounded flex items-center justify-center
            text-slate-400 hover:text-slate-600 hover:bg-slate-100
            transition-all ${FOCUS_RING}
          `}
          title="메뉴"
          aria-label={`${todo.text} 메뉴`}
          aria-expanded={showMenu}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        {/* Dropdown menu (fixed position to avoid overflow clipping) */}
        {showMenu && menuPos && (
          <div
            className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[100px]"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              transform: 'translateX(-100%)',
            }}
          >
            {/* Toggle complete option */}
            <button
              onClick={() => {
                onToggle();
                setShowMenu(false);
              }}
              className={`${MENU_ITEM} text-slate-600 hover:bg-slate-50`}
            >
              {todo.completed ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  </svg>
                  미완료
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  완료
                </>
              )}
            </button>

            {/* Divider */}
            <div className="border-t border-slate-100 my-1" />

            {/* Color option */}
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className={`${MENU_ITEM} text-slate-600 hover:bg-slate-50`}
            >
              <span
                className="w-3 h-3 rounded-full border border-slate-200"
                style={{ backgroundColor: barColor !== 'transparent' ? barColor : '#E5E7EB' }}
              />
              색상
            </button>

            {/* Color picker dropdown */}
            {showColorPicker && (
              <div className="px-2 py-1.5 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-1">
                  {TODO_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorSelect(color)}
                      className={`
                        w-6 h-6 rounded-full border-2 transition-all
                        ${todoColor === color ? 'border-slate-400 scale-110' : 'border-transparent hover:scale-105'}
                      `}
                      style={{
                        backgroundColor: color === 'none' ? '#F3F4F6' : TODO_COLOR_BAR[color],
                      }}
                      title={TODO_COLOR_LABELS[color]}
                    >
                      {color === 'none' && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#9CA3AF"
                          strokeWidth="2"
                          className="w-full h-full p-1"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicate option */}
            <button
              onClick={handleDuplicate}
              className={`${MENU_ITEM} text-slate-600 hover:bg-slate-50`}
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
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              복제
            </button>

            {/* 다른 요일·블록·할 일 목록으로 옮기기 (드래그 대신) */}
            {requestMove && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowColorPicker(false);
                  // 대화상자가 닫힐 때 초점이 돌아올 곳: 사라지는 메뉴 항목 대신 메뉴 버튼
                  menuBtnRef.current?.focus();
                  requestMove({ todo, sourceType, sourceId });
                }}
                className={`${MENU_ITEM} text-slate-600 hover:bg-slate-50`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 9 2 12 5 15" />
                  <polyline points="19 9 22 12 19 15" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                옮기기…
              </button>
            )}

            {/* Divider */}
            <div className="border-t border-slate-100 my-1" />

            {/* Delete option */}
            <button
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
              className={`${MENU_ITEM} text-red-500 hover:bg-red-50`}
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
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
