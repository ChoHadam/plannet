'use client';

import { createContext, useContext, useId, useState } from 'react';
import { useModalDialog } from '@/hooks/useModalDialog';
import { FOCUS_RING } from '@/lib/constants';
import {
  BlockData,
  BlockNumber,
  BLOCK_TIME_OF_DAY,
  DAYS_OF_WEEK,
  DAY_LABELS,
  DayOfWeek,
  TIME_OF_DAY_LABELS,
  TodoItem,
} from '@/types/block6';

/** 옮길 할 일과 지금 있는 곳 (드래그의 active.data와 같은 모양) */
export interface MoveTodoRequest {
  todo: TodoItem;
  sourceType: 'backlog' | 'block';
  sourceId: string | null;
}

/**
 * 할 일 `⋮` 메뉴의 `옮기기…`. 드래그는 화면에 함께 보이는 곳으로만 옮길 수 있어(모바일은 한 요일만 보임)
 * 요일·블록·할 일 목록을 직접 고르는 길을 둔다. 그리드가 제공하지 않으면 메뉴 항목도 없다.
 */
export const MoveTodoContext = createContext<((request: MoveTodoRequest) => void) | null>(null);
export const useMoveTodoRequest = () => useContext(MoveTodoContext);

const BLOCK_NUMBERS: BlockNumber[] = [1, 2, 3, 4, 5, 6];
const OPTION_CLASS = `min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

interface MoveTodoDialogProps {
  request: MoveTodoRequest;
  blocks: BlockData[];
  /** 할 일 목록에서 옮길 때 처음 보일 요일 (모바일: 보고 있던 요일) */
  defaultDay: DayOfWeek;
  onMove: (destType: 'backlog' | 'block', destId: string | null) => void;
  onClose: () => void;
}

export function MoveTodoDialog({ request, blocks, defaultDay, onMove, onClose }: MoveTodoDialogProps) {
  const titleId = useId();
  const { dialogProps } = useModalDialog({ onClose });
  const sourceBlock = request.sourceType === 'block' ? blocks.find((b) => b.id === request.sourceId) : undefined;
  const [day, setDay] = useState<DayOfWeek>(sourceBlock?.day ?? defaultDay);

  const choose = (destType: 'backlog' | 'block', destId: string | null) => {
    onMove(destType, destId);
    onClose();
  };

  return (
    <div className="fixed inset-0 overlay-safe bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div
        {...dialogProps}
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 max-h-full overflow-y-auto animate-in outline-none"
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-800">할 일 옮기기</h3>
        <p className="mt-1 text-sm text-slate-500 break-words">{request.todo.text}</p>

        <button
          type="button"
          onClick={() => choose('backlog', null)}
          disabled={request.sourceType === 'backlog'}
          className={`mt-4 w-full border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 ${OPTION_CLASS}`}
        >
          할 일 목록{request.sourceType === 'backlog' ? ' · 현재 위치' : ''}
        </button>

        <p className="mt-4 mb-2 text-xs text-slate-500">요일</p>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="요일">
          {DAYS_OF_WEEK.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={day === d}
              className={`min-h-11 rounded-lg text-sm font-medium ${FOCUS_RING} ${day === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>

        <p className="mt-4 mb-2 text-xs text-slate-500">{DAY_LABELS[day]}요일 블록</p>
        <div className="grid grid-cols-2 gap-2">
          {BLOCK_NUMBERS.map((n) => {
            const block = blocks.find((b) => b.day === day && b.blockNumber === n);
            if (!block) return null;
            const current = block.id === sourceBlock?.id;
            return (
              <button
                key={n}
                type="button"
                onClick={() => choose('block', block.id)}
                disabled={current}
                className={`border-slate-200 bg-white text-slate-700 hover:bg-slate-50 ${OPTION_CLASS}`}
              >
                <span className="block">Block {n} · {TIME_OF_DAY_LABELS[BLOCK_TIME_OF_DAY[n]]}{current ? ' · 현재 위치' : ''}</span>
                {block.keyword && <span className="block truncate text-xs text-slate-500">{block.keyword}</span>}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`mt-4 w-full min-h-11 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 ${FOCUS_RING}`}
        >
          취소
        </button>
      </div>
    </div>
  );
}
