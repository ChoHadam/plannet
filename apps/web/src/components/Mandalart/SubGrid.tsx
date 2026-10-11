'use client';

import { Cell } from './Cell';
import { CellData, GridPosition } from '@/types/mandalart';
import { FOCUS_RING } from '@/lib/constants';

interface SubGridProps {
  gridId: GridPosition;
  cells: CellData[];
  color: string;
  cellColors?: Record<number, string>;  // 셀별 개별 색상 (중앙 그리드용)
  onCellChange: (cellIndex: number, value: string) => void;
  onToggleCellCompleted?: (cellIndex: number) => void;
  onIconClick?: (cellIndex: number) => void;
  onClearCell?: (cellIndex: number) => void;
  onScheduleClick?: (cellIndex: number) => void;
  onColorClick?: () => void;
  isCenter?: boolean;
  disabled?: boolean;
  /** disabled여도 편집할 수 있는 셀. 모바일 상세에서 빈 하위 목표(외곽 가운데 칸)를 입력하는 용도. */
  editableCellIndex?: number;
}

export function SubGrid({
  cells,
  color,
  cellColors,
  onCellChange,
  onToggleCellCompleted,
  onIconClick,
  onClearCell,
  onScheduleClick,
  onColorClick,
  isCenter = false,
  disabled = false,
  editableCellIndex,
}: SubGridProps) {
  return (
    <div
      className={`
        relative group
        grid grid-cols-3 gap-0.5
        p-1 rounded-lg
        transition-all duration-300
        ${isCenter ? 'ring-2 ring-amber-400/50 shadow-xl' : 'shadow-md'}
        ${disabled && editableCellIndex === undefined ? 'opacity-50 grayscale cursor-not-allowed' : ''}
      `}
      style={{ backgroundColor: color }}
    >
      {cells.map((cell, index) => {
        const isMainGoal = isCenter && index === 4;
        const isSubGoal = isCenter ? index !== 4 : index === 4;
        // 중앙 그리드 하위 목표는 해당 외곽 그리드 색상 사용
        const cellBgColor = cellColors?.[index] ?? color;

        return (
          <Cell
            key={cell.id}
            value={cell.value}
            onChange={(value) => onCellChange(index, value)}
            isMainGoal={isMainGoal}
            isSubGoal={isSubGoal}
            backgroundColor={cellBgColor}
            placeholder={isMainGoal ? '핵심 목표' : isSubGoal ? '하위 목표' : ''}
            disabled={disabled && index !== editableCellIndex}
            completed={cell.completed ?? false}
            onToggleCompleted={onToggleCellCompleted ? () => onToggleCellCompleted(index) : undefined}
            icon={cell.icon}
            onIconClick={onIconClick ? () => onIconClick(index) : undefined}
            onClearCell={onClearCell ? () => onClearCell(index) : undefined}
            schedule={cell.schedule}
            onScheduleClick={
              onScheduleClick && !isCenter && index !== 4
                ? () => onScheduleClick(index)
                : undefined
            }
          />
        );
      })}

      {/* 팔레트 버튼 (우측 상단). 터치에서는 늘 보이는 셀 이모지 버튼(히트 영역 44px)과 겹치지 않게
          그리드 바깥 여백(그리드 사이 gap-2·모바일 p-3)으로 8px 내보내고 위에 둔다. */}
      {!disabled && onColorClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onColorClick();
          }}
          aria-label="색상 변경"
          className={`
            absolute top-0 right-0 touch:-top-2 touch:-right-2
            w-7 h-7 rounded-full ${FOCUS_RING}
            bg-white hover:bg-slate-50
            opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
            touch:opacity-80
            transition-all duration-200
            hover:scale-110
            flex items-center justify-center
            shadow-lg border border-slate-200
            z-10 touch:z-30
          `}
          title="색상 변경"
        >
          <div className="grid grid-cols-2 gap-0.5">
            <div className="w-2 h-2 rounded-full bg-rose-400"></div>
            <div className="w-2 h-2 rounded-full bg-amber-400"></div>
            <div className="w-2 h-2 rounded-full bg-sky-400"></div>
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          </div>
        </button>
      )}
    </div>
  );
}
