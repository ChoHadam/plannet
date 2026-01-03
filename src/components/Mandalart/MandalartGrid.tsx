'use client';

import { useState } from 'react';
import { SubGrid } from './SubGrid';
import { ColorPicker } from '../ColorPicker';
import { useMandalartStore } from '@/hooks/useMandalart';
import { GridPosition, GRID_POSITIONS, OUTER_TO_CENTER_MAP } from '@/types/mandalart';

export function MandalartGrid() {
  const data = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find(m => m.id === state.currentId) || null;
  });
  const updateCell = useMandalartStore((state) => state.updateCell);
  const updateGridColor = useMandalartStore((state) => state.updateGridColor);
  const [selectedGrid, setSelectedGrid] = useState<GridPosition | null>(null);

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
              onCellChange={(cellIndex, value) =>
                handleCellChange(grid.id, cellIndex, value)
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
    </div>
  );
}
