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
  completed?: boolean;
}

export interface SubGridData {
  id: GridPosition;
  cells: CellData[];
  color: string;
}

// Plan categories (sidebar sections)
export type PlanCategory = 'annual' | 'monthly' | 'weekly' | 'daily';

// Template types
export type TemplateType = 'mandalart';  // 추후: 'calendar' | 'checklist' 등 추가

export const PLAN_CATEGORY_LABELS: Record<PlanCategory, string> = {
  annual: '연간 플랜',
  monthly: '월간 플랜',
  weekly: '주간 플랜',
  daily: '일간 플랜',
};

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  mandalart: '만다라트',
};

export interface MandalartData {
  id: string;
  title: string;
  category: PlanCategory;
  template: 'mandalart';
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

