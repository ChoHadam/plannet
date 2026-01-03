'use client';

import { Cell } from './Cell';
import { CellData, GridPosition } from '@/types/mandalart';

interface SubGridProps {
  gridId: GridPosition;
  cells: CellData[];
  color: string;
  cellColors?: Record<number, string>;  // 셀별 개별 색상 (중앙 그리드용)
  onCellChange: (cellIndex: number, value: string) => void;
  onToggleCellCompleted?: (cellIndex: number) => void;
  onIconClick?: (cellIndex: number) => void;
  onClearCell?: (cellIndex: number) => void;
  onColorClick?: () => void;
  isCenter?: boolean;
  disabled?: boolean;
}

export function SubGrid({
  gridId,
  cells,
  color,
  cellColors,
  onCellChange,
  onToggleCellCompleted,
  onIconClick,
  onClearCell,
  onColorClick,
  isCenter = false,
  disabled = false,
}: SubGridProps) {
  return (
    <div
      className={`
        relative group
        grid grid-cols-3 gap-0.5
        p-1 rounded-lg
        transition-all duration-300
        ${isCenter ? 'ring-2 ring-amber-400/50 shadow-xl' : 'shadow-md'}
        ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : ''}
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
            disabled={disabled}
            completed={cell.completed ?? false}
            onToggleCompleted={onToggleCellCompleted ? () => onToggleCellCompleted(index) : undefined}
            icon={cell.icon}
            onIconClick={onIconClick ? () => onIconClick(index) : undefined}
            onClearCell={onClearCell ? () => onClearCell(index) : undefined}
          />
        );
      })}

      {/* 팔레트 버튼 (우측 상단) */}
      {!disabled && onColorClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onColorClick();
          }}
          className="
            absolute -top-2 -right-2
            w-8 h-8 rounded-full
            bg-white hover:bg-slate-50
            opacity-0 group-hover:opacity-100
            max-sm:opacity-80
            transition-all duration-200
            hover:scale-110
            flex items-center justify-center
            shadow-lg border border-slate-200
            z-10
          "
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
