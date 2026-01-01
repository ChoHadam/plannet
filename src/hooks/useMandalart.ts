'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MandalartData,
  SubGridData,
  CellData,
  GridPosition,
  GRID_POSITIONS,
  CENTER_TO_OUTER_MAP,
  OUTER_TO_CENTER_MAP,
} from '@/types/mandalart';
import { DEFAULT_COLORS, STORAGE_KEY } from '@/lib/constants';
import { generateId, sanitizeInput } from '@/lib/sanitize';

interface MandalartStore {
  data: MandalartData;
  updateCell: (gridId: GridPosition, cellIndex: number, value: string) => void;
  updateGridColor: (gridId: GridPosition, color: string) => void;
  updateTitle: (title: string) => void;
  resetAll: () => void;
}

// Create initial empty mandalart data
const createInitialData = (): MandalartData => {
  const grids: SubGridData[] = GRID_POSITIONS.map((position) => ({
    id: position,
    color: DEFAULT_COLORS[position],
    cells: Array.from({ length: 9 }, (_, i) => ({
      id: `${position}-${i}`,
      value: '',
      position: i,
    })),
  }));

  return {
    id: generateId(),
    title: '',
    grids,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const useMandalartStore = create<MandalartStore>()(
  persist(
    (set, get) => ({
      data: createInitialData(),

      updateCell: (gridId: GridPosition, cellIndex: number, value: string) => {
        const sanitizedValue = sanitizeInput(value);

        set((state) => {
          const newGrids = state.data.grids.map((grid) => {
            if (grid.id === gridId) {
              const newCells = grid.cells.map((cell, idx) =>
                idx === cellIndex ? { ...cell, value: sanitizedValue } : cell
              );
              return { ...grid, cells: newCells };
            }
            return grid;
          });

          // Sync logic: center grid <-> outer grids
          // If editing center grid's outer cells (not position 4), sync to outer grid's center
          if (gridId === 'center' && cellIndex !== 4) {
            const targetGridId = CENTER_TO_OUTER_MAP[cellIndex];
            if (targetGridId) {
              const targetGridIndex = newGrids.findIndex((g) => g.id === targetGridId);
              if (targetGridIndex !== -1) {
                newGrids[targetGridIndex] = {
                  ...newGrids[targetGridIndex],
                  cells: newGrids[targetGridIndex].cells.map((cell, idx) =>
                    idx === 4 ? { ...cell, value: sanitizedValue } : cell
                  ),
                };
              }
            }
          }

          // If editing outer grid's center (position 4), sync to center grid
          if (gridId !== 'center' && cellIndex === 4) {
            const centerCellIndex = OUTER_TO_CENTER_MAP[gridId];
            if (centerCellIndex !== undefined && centerCellIndex !== 4) {
              const centerGridIndex = newGrids.findIndex((g) => g.id === 'center');
              if (centerGridIndex !== -1) {
                newGrids[centerGridIndex] = {
                  ...newGrids[centerGridIndex],
                  cells: newGrids[centerGridIndex].cells.map((cell, idx) =>
                    idx === centerCellIndex ? { ...cell, value: sanitizedValue } : cell
                  ),
                };
              }
            }
          }

          return {
            data: {
              ...state.data,
              grids: newGrids,
              updatedAt: new Date().toISOString(),
            },
          };
        });
      },

      updateGridColor: (gridId: GridPosition, color: string) => {
        set((state) => ({
          data: {
            ...state.data,
            grids: state.data.grids.map((grid) =>
              grid.id === gridId ? { ...grid, color } : grid
            ),
            updatedAt: new Date().toISOString(),
          },
        }));
      },

      updateTitle: (title: string) => {
        set((state) => ({
          data: {
            ...state.data,
            title: sanitizeInput(title),
            updatedAt: new Date().toISOString(),
          },
        }));
      },

      resetAll: () => {
        set({ data: createInitialData() });
      },
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
