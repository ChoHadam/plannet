'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import {
  MandalartData,
  SubGridData,
  GridPosition,
  GRID_POSITIONS,
  CENTER_TO_OUTER_MAP,
  OUTER_TO_CENTER_MAP,
  PlanCategory,
} from '@/types/mandalart';
import { DEFAULT_COLORS, STORAGE_KEY } from '@/lib/constants';
import { generateId, sanitizeInput } from '@/lib/sanitize';

interface MandalartStore {
  // Multiple plans support
  mandalarts: MandalartData[];
  currentId: string | null;

  // Computed getter
  data: MandalartData | null;

  // Plan management
  createMandalart: (category: PlanCategory, title?: string) => string;
  selectMandalart: (id: string) => void;
  deleteMandalart: (id: string) => void;
  getMandalartsByCategory: (category: PlanCategory) => MandalartData[];

  // Cell operations (for current plan)
  updateCell: (gridId: GridPosition, cellIndex: number, value: string) => void;
  toggleCellCompleted: (gridId: GridPosition, cellIndex: number) => void;
  updateGridColor: (gridId: GridPosition, color: string) => void;
  updateTitle: (title: string) => void;
  resetCurrent: () => void;
}

// Create initial empty mandalart data
const createInitialMandalart = (category: PlanCategory, title: string = ''): MandalartData => {
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
    title,
    category,
    template: 'mandalart',
    grids,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const useMandalartStore = create<MandalartStore>()(
  persist(
    (set, get) => ({
      mandalarts: [],
      currentId: null,

      get data() {
        const state = get();
        if (!state.currentId) return null;
        return state.mandalarts.find(m => m.id === state.currentId) || null;
      },

      createMandalart: (category: PlanCategory, title?: string) => {
        const newMandalart = createInitialMandalart(category, title || '');
        set((state) => ({
          mandalarts: [newMandalart, ...state.mandalarts],
          currentId: newMandalart.id,
        }));
        return newMandalart.id;
      },

      selectMandalart: (id: string) => {
        set({ currentId: id });
      },

      deleteMandalart: (id: string) => {
        set((state) => {
          const newMandalarts = state.mandalarts.filter(m => m.id !== id);
          const newCurrentId = state.currentId === id
            ? (newMandalarts[0]?.id || null)
            : state.currentId;
          return {
            mandalarts: newMandalarts,
            currentId: newCurrentId,
          };
        });
      },

      getMandalartsByCategory: (category: PlanCategory) => {
        return get().mandalarts.filter(m => m.category === category);
      },

      updateCell: (gridId: GridPosition, cellIndex: number, value: string) => {
        const sanitizedValue = sanitizeInput(value);
        const currentId = get().currentId;
        if (!currentId) return;

        set((state) => {
          const mandalartIndex = state.mandalarts.findIndex(m => m.id === currentId);
          if (mandalartIndex === -1) return state;

          const mandalart = state.mandalarts[mandalartIndex];
          const newGrids = mandalart.grids.map((grid) => {
            if (grid.id === gridId) {
              const newCells = grid.cells.map((cell, idx) =>
                idx === cellIndex ? { ...cell, value: sanitizedValue } : cell
              );
              return { ...grid, cells: newCells };
            }
            return grid;
          });

          // Sync logic: center grid <-> outer grids
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

          const newMandalarts = [...state.mandalarts];
          newMandalarts[mandalartIndex] = {
            ...mandalart,
            grids: newGrids,
            updatedAt: new Date().toISOString(),
          };

          return { mandalarts: newMandalarts };
        });
      },

      toggleCellCompleted: (gridId: GridPosition, cellIndex: number) => {
        const currentId = get().currentId;
        if (!currentId) return;

        set((state) => {
          const mandalartIndex = state.mandalarts.findIndex(m => m.id === currentId);
          if (mandalartIndex === -1) return state;

          const mandalart = state.mandalarts[mandalartIndex];
          let newGrids = [...mandalart.grids];

          // 하위 목표인지 확인 (center grid의 0-3,5-8 또는 outer grid의 position 4)
          const isSubGoal = (gridId === 'center' && cellIndex !== 4) ||
                           (gridId !== 'center' && cellIndex === 4);

          if (isSubGoal) {
            // 하위 목표 체크 시 해당 외곽 그리드 전체 토글
            let targetGridId: GridPosition;

            if (gridId === 'center') {
              // center grid에서 클릭 → 해당하는 outer grid 찾기
              targetGridId = CENTER_TO_OUTER_MAP[cellIndex];
            } else {
              // outer grid position 4 클릭 → 현재 그리드
              targetGridId = gridId;
            }

            // 현재 하위 목표의 completed 상태 확인
            const targetGrid = newGrids.find(g => g.id === targetGridId);
            const subGoalCell = targetGrid?.cells[4];
            const newCompleted = !subGoalCell?.completed;

            // 해당 외곽 그리드 전체 셀 토글
            newGrids = newGrids.map((grid) => {
              if (grid.id === targetGridId) {
                return {
                  ...grid,
                  cells: grid.cells.map(cell => ({ ...cell, completed: newCompleted })),
                };
              }
              // 중앙 그리드의 해당 하위 목표도 동기화
              if (grid.id === 'center') {
                const centerCellIndex = OUTER_TO_CENTER_MAP[targetGridId];
                return {
                  ...grid,
                  cells: grid.cells.map((cell, idx) =>
                    idx === centerCellIndex ? { ...cell, completed: newCompleted } : cell
                  ),
                };
              }
              return grid;
            });
          } else {
            // 일반 셀 개별 토글
            newGrids = newGrids.map((grid) => {
              if (grid.id === gridId) {
                const newCells = grid.cells.map((cell, idx) =>
                  idx === cellIndex ? { ...cell, completed: !cell.completed } : cell
                );
                return { ...grid, cells: newCells };
              }
              return grid;
            });

            // 외곽 그리드의 텍스트가 있는 셀이 모두 체크되었는지 확인 후 하위 목표 동기화
            if (gridId !== 'center') {
              const updatedGrid = newGrids.find(g => g.id === gridId);
              if (updatedGrid) {
                // 하위 목표(position 4) 제외, 텍스트가 있는 셀만 대상
                const cellsWithText = updatedGrid.cells.filter((cell, idx) =>
                  idx !== 4 && cell.value.trim()
                );
                const allCompleted = cellsWithText.length > 0 &&
                  cellsWithText.every(cell => cell.completed);
                const centerCellIndex = OUTER_TO_CENTER_MAP[gridId];

                newGrids = newGrids.map((grid) => {
                  // 중앙 그리드의 해당 하위 목표 동기화
                  if (grid.id === 'center') {
                    return {
                      ...grid,
                      cells: grid.cells.map((cell, idx) =>
                        idx === centerCellIndex ? { ...cell, completed: allCompleted } : cell
                      ),
                    };
                  }
                  // 외곽 그리드의 하위 목표(position 4)도 동기화
                  if (grid.id === gridId) {
                    return {
                      ...grid,
                      cells: grid.cells.map((cell, idx) =>
                        idx === 4 ? { ...cell, completed: allCompleted } : cell
                      ),
                    };
                  }
                  return grid;
                });
              }
            }
          }

          const newMandalarts = [...state.mandalarts];
          newMandalarts[mandalartIndex] = {
            ...mandalart,
            grids: newGrids,
            updatedAt: new Date().toISOString(),
          };

          return { mandalarts: newMandalarts };
        });
      },

      updateGridColor: (gridId: GridPosition, color: string) => {
        const currentId = get().currentId;
        if (!currentId) return;

        set((state) => {
          const mandalartIndex = state.mandalarts.findIndex(m => m.id === currentId);
          if (mandalartIndex === -1) return state;

          const mandalart = state.mandalarts[mandalartIndex];
          const newMandalarts = [...state.mandalarts];
          newMandalarts[mandalartIndex] = {
            ...mandalart,
            grids: mandalart.grids.map((grid) =>
              grid.id === gridId ? { ...grid, color } : grid
            ),
            updatedAt: new Date().toISOString(),
          };

          return { mandalarts: newMandalarts };
        });
      },

      updateTitle: (title: string) => {
        const currentId = get().currentId;
        if (!currentId) return;

        set((state) => {
          const mandalartIndex = state.mandalarts.findIndex(m => m.id === currentId);
          if (mandalartIndex === -1) return state;

          const newMandalarts = [...state.mandalarts];
          newMandalarts[mandalartIndex] = {
            ...newMandalarts[mandalartIndex],
            title: sanitizeInput(title),
            updatedAt: new Date().toISOString(),
          };

          return { mandalarts: newMandalarts };
        });
      },

      resetCurrent: () => {
        const currentId = get().currentId;
        if (!currentId) return;

        set((state) => {
          const mandalartIndex = state.mandalarts.findIndex(m => m.id === currentId);
          if (mandalartIndex === -1) return state;

          const oldMandalart = state.mandalarts[mandalartIndex];
          const newMandalart = createInitialMandalart(oldMandalart.category, oldMandalart.title);
          newMandalart.id = oldMandalart.id; // Keep same ID

          const newMandalarts = [...state.mandalarts];
          newMandalarts[mandalartIndex] = newMandalart;

          return { mandalarts: newMandalarts };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      skipHydration: true,
      partialize: (state) => ({
        mandalarts: state.mandalarts,
        currentId: state.currentId,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          return { mandalarts: [], currentId: null };
        }
        return persistedState as { mandalarts: MandalartData[]; currentId: string | null };
      },
    }
  )
);

// Hydration hook for Next.js
export const useHydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useMandalartStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  return hydrated;
};
