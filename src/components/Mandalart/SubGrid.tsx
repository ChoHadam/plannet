'use client';

import { Cell } from './Cell';
import { CellData, GridPosition } from '@/types/mandalart';

interface SubGridProps {
  gridId: GridPosition;
  cells: CellData[];
  color: string;
  onCellChange: (cellIndex: number, value: string) => void;
  onColorClick?: () => void;
  isCenter?: boolean;
  disabled?: boolean;
}

export function SubGrid({
  gridId,
  cells,
  color,
  onCellChange,
  onColorClick,
  isCenter = false,
  disabled = false,
}: SubGridProps) {
  return (
    <div
      className={`
        grid grid-cols-3 gap-0.5
        p-1 rounded-lg
        transition-all duration-300
        ${isCenter ? 'ring-2 ring-amber-400/50 shadow-xl' : 'shadow-md'}
        ${!disabled ? 'cursor-pointer' : 'cursor-not-allowed'}
        ${disabled ? 'opacity-50 grayscale' : ''}
      `}
      style={{ backgroundColor: color }}
      onClick={(e) => {
        // Only trigger if clicking the grid background, not cells
        if (e.target === e.currentTarget && onColorClick && !disabled) {
          onColorClick();
        }
      }}
    >
      {cells.map((cell, index) => {
        const isMainGoal = isCenter && index === 4;
        const isSubGoal = isCenter ? index !== 4 : index === 4;

        return (
          <Cell
            key={cell.id}
            value={cell.value}
            onChange={(value) => onCellChange(index, value)}
            isMainGoal={isMainGoal}
            isSubGoal={isSubGoal}
            backgroundColor={color}
            placeholder={isMainGoal ? '핵심 목표' : isSubGoal ? '하위 목표' : ''}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}
