'use client';

import { useState, useRef, useEffect } from 'react';
import { BlockData, BLOCK_TIME_OF_DAY, TimeOfDay } from '@/types/block6';
import { BLOCK6_TIME_COLORS } from '@/lib/constants';
import { DroppableTodoList } from './DroppableTodoList';

interface BlockCardProps {
  block: BlockData;
  onKeywordChange: (keyword: string) => void;
  onAddTodo: (text: string) => void;
  onToggleTodo: (todoId: string) => void;
  onUpdateTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
}

export function BlockCard({
  block,
  onKeywordChange,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
}: BlockCardProps) {
  const [isEditingKeyword, setIsEditingKeyword] = useState(false);
  const [keywordValue, setKeywordValue] = useState(block.keyword);
  const inputRef = useRef<HTMLInputElement>(null);

  const timeOfDay: TimeOfDay = BLOCK_TIME_OF_DAY[block.blockNumber];
  const backgroundColor = block.color || BLOCK6_TIME_COLORS[timeOfDay];

  useEffect(() => {
    setKeywordValue(block.keyword);
  }, [block.keyword]);

  useEffect(() => {
    if (isEditingKeyword && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingKeyword]);

  const handleKeywordSave = () => {
    const trimmed = keywordValue.trim();
    if (trimmed !== block.keyword) {
      onKeywordChange(trimmed);
    }
    setIsEditingKeyword(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleKeywordSave();
    } else if (e.key === 'Escape') {
      setKeywordValue(block.keyword);
      setIsEditingKeyword(false);
    }
  };

  // Calculate completion rate
  const completedCount = block.todos.filter((t) => t.completed).length;
  const totalCount = block.todos.length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      className="
        flex flex-col h-full p-2 rounded-lg border border-slate-200/50
        transition-all hover:shadow-sm
      "
      style={{ backgroundColor }}
    >
      {/* Keyword Header */}
      <div className="flex items-center justify-between mb-1.5">
        {isEditingKeyword ? (
          <input
            ref={inputRef}
            type="text"
            value={keywordValue}
            onChange={(e) => setKeywordValue(e.target.value)}
            onBlur={handleKeywordSave}
            onKeyDown={handleKeyDown}
            className="
              flex-1 text-sm font-semibold text-slate-700
              bg-white/80 border border-slate-300 rounded px-1.5 py-0.5
              focus:outline-none focus:ring-1 focus:ring-slate-400
            "
            placeholder="키워드"
          />
        ) : (
          <div
            onClick={() => setIsEditingKeyword(true)}
            className="
              flex-1 text-sm font-semibold text-slate-700
              cursor-text truncate min-h-[1.5rem] flex items-center
            "
          >
            {block.keyword || (
              <span className="text-slate-400 font-normal">키워드</span>
            )}
          </div>
        )}

        {/* Completion indicator */}
        {totalCount > 0 && (
          <span
            className={`
              text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-1
              ${completionRate === 100
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 text-slate-500'}
            `}
          >
            {completedCount}/{totalCount}
          </span>
        )}
      </div>

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
        maxTodos={5}
      />
    </div>
  );
}
