'use client';

import { useState } from 'react';
import { SubGrid } from './SubGrid';
import { ColorPicker } from '../ColorPicker';
import { EmojiPickerWrapper } from '../EmojiPicker';
import { useMandalartStore } from '@/hooks/useMandalart';
import { GridPosition, GRID_POSITIONS, OUTER_TO_CENTER_MAP, CENTER_TO_OUTER_MAP } from '@/types/mandalart';

export function MandalartGrid() {
  const data = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find(m => m.id === state.currentId) || null;
  });
  const updateCell = useMandalartStore((state) => state.updateCell);
  const updateCellIcon = useMandalartStore((state) => state.updateCellIcon);
  const toggleCellCompleted = useMandalartStore((state) => state.toggleCellCompleted);
  const clearCell = useMandalartStore((state) => state.clearCell);
  const updateGridColor = useMandalartStore((state) => state.updateGridColor);
  const [selectedGrid, setSelectedGrid] = useState<GridPosition | null>(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<{ gridId: GridPosition; cellIndex: number } | null>(null);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        사이드바에서 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const handleCellChange = (gridId: GridPosition, cellIndex: number, value: string) => {
    updateCell(gridId, cellIndex, value);
  };

  const handleToggleCellCompleted = (gridId: GridPosition, cellIndex: number) => {
    toggleCellCompleted(gridId, cellIndex);
  };

  const handleColorClick = (gridId: GridPosition) => {
    setSelectedGrid(gridId);
  };

  const handleColorSelect = (color: string) => {
    if (selectedGrid) {
      updateGridColor(selectedGrid, color);
    }
  };

  const handleClosePicker = () => {
    setSelectedGrid(null);
  };

  const handleIconClick = (gridId: GridPosition, cellIndex: number) => {
    setEmojiPickerTarget({ gridId, cellIndex });
  };

  const handleEmojiSelect = (emoji: string | null) => {
    if (emojiPickerTarget) {
      updateCellIcon(emojiPickerTarget.gridId, emojiPickerTarget.cellIndex, emoji);
    }
  };

  const handleCloseEmojiPicker = () => {
    setEmojiPickerTarget(null);
  };

  const handleClearCell = (gridId: GridPosition, cellIndex: number) => {
    clearCell(gridId, cellIndex);
  };

  // Get grid by position
  const getGrid = (position: GridPosition) => {
    return data.grids.find((g) => g.id === position);
  };

  // Check if outer grid should be enabled (based on center grid cell value)
  const isGridEnabled = (gridId: GridPosition): boolean => {
    if (gridId === 'center') return true;

    const centerGrid = data.grids.find((g) => g.id === 'center');
    if (!centerGrid) return false;

    const cellIndex = OUTER_TO_CENTER_MAP[gridId];
    const cellValue = centerGrid.cells[cellIndex]?.value?.trim() || '';
    return cellValue !== '';
  };

  // 중앙 그리드 하위 목표 셀 색상 (외곽 그리드 색상과 동기화)
  const getCenterGridCellColors = (): Record<number, string> => {
    const colors: Record<number, string> = {};
    // position 0-3, 5-8은 해당 외곽 그리드 색상 사용
    [0, 1, 2, 3, 5, 6, 7, 8].forEach((cellIndex) => {
      const outerGridId = CENTER_TO_OUTER_MAP[cellIndex];
      const outerGrid = data.grids.find((g) => g.id === outerGridId);
      if (outerGrid) {
        colors[cellIndex] = outerGrid.color;
      }
    });
    return colors;
  };

  return (
    <div className="relative">
      <div id="mandalart-grid" className="grid grid-cols-3 gap-2 p-4 bg-slate-100/50 rounded-2xl shadow-inner max-w-4xl mx-auto">
        {GRID_POSITIONS.map((position) => {
          const grid = getGrid(position);
          if (!grid) return null;

          const enabled = isGridEnabled(position);

          return (
            <SubGrid
              key={grid.id}
              gridId={grid.id}
              cells={grid.cells}
              color={grid.color}
              cellColors={position === 'center' ? getCenterGridCellColors() : undefined}
              onCellChange={(cellIndex, value) =>
                handleCellChange(grid.id, cellIndex, value)
              }
              onToggleCellCompleted={(cellIndex) =>
                handleToggleCellCompleted(grid.id, cellIndex)
              }
              onIconClick={(cellIndex) =>
                handleIconClick(grid.id, cellIndex)
              }
              onClearCell={(cellIndex) =>
                handleClearCell(grid.id, cellIndex)
              }
              onColorClick={() => handleColorClick(grid.id)}
              isCenter={position === 'center'}
              disabled={!enabled}
            />
          );
        })}
      </div>

      {/* Color Picker Modal */}
      {selectedGrid && (
        <ColorPicker
          currentColor={getGrid(selectedGrid)?.color || ''}
          onSelect={handleColorSelect}
          onClose={handleClosePicker}
        />
      )}

      {/* Emoji Picker Modal */}
      {emojiPickerTarget && (
        <EmojiPickerWrapper
          currentEmoji={
            getGrid(emojiPickerTarget.gridId)?.cells[emojiPickerTarget.cellIndex]?.icon
          }
          onSelect={handleEmojiSelect}
          onClose={handleCloseEmojiPicker}
        />
      )}
    </div>
  );
}
