export type GridPosition =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface CellData {
  id: string;
  value: string;
  position: number; // 0-8 within 3x3 grid
}

export interface SubGridData {
  id: GridPosition;
  cells: CellData[];
  color: string;
}

export interface MandalartData {
  id: string;
  title: string;
  grids: SubGridData[];
  createdAt: string;
  updatedAt: string;
}

// Grid positions in order (for iteration)
export const GRID_POSITIONS: GridPosition[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

// Mapping: center grid cell position -> outer grid id
export const CENTER_TO_OUTER_MAP: Record<number, GridPosition> = {
  0: 'top-left',
  1: 'top',
  2: 'top-right',
  3: 'left',
  // 4 is main goal (no sync)
  5: 'right',
  6: 'bottom-left',
  7: 'bottom',
  8: 'bottom-right',
};

// Reverse mapping: outer grid id -> center grid cell position
export const OUTER_TO_CENTER_MAP: Record<GridPosition, number> = {
  'top-left': 0,
  'top': 1,
  'top-right': 2,
  'left': 3,
  'center': 4,
  'right': 5,
  'bottom-left': 6,
  'bottom': 7,
  'bottom-right': 8,
};
