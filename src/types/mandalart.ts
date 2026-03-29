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

export type RepeatCycle = 'daily' | 'weekly' | 'monthly';

export interface CellSchedule {
  targetMonths?: number[];   // 대상 월 (1-12), 복수 선택 가능
  startDate?: string;        // 시작일 (ISO date, "2026-04-01")
  endDate?: string;          // 종료일
  repeat?: RepeatCycle;      // 반복 주기
  repeatDays?: number[];     // 주간 반복 시 요일 (0=일, 1=월, ..., 6=토)
}

export interface CellData {
  id: string;
  value: string;
  position: number; // 0-8 within 3x3 grid
  completed?: boolean;
  icon?: string;
  schedule?: CellSchedule;
}

export interface SubGridData {
  id: GridPosition;
  cells: CellData[];
  color: string;
}

// Plan categories (sidebar sections)
export type PlanCategory = 'annual' | 'monthly' | 'weekly' | 'daily';

// Template types
export type TemplateType = 'mandalart' | 'block6' | 'monthly' | 'daily';

export const PLAN_CATEGORY_LABELS: Record<PlanCategory, string> = {
  annual: '연간 플랜',
  monthly: '월간 플랜',
  weekly: '주간 플랜',
  daily: '일간 플랜',
};

export interface MandalartData {
  id: string;
  title: string;
  category: PlanCategory;
  template: 'mandalart';
  grids: SubGridData[];
  createdAt: string;
  updatedAt: string;
  year?: number;   // 모든 플랜
  month?: number;  // 월간/주간/일간 (1-12)
  week?: number;   // 주간 (1-53)
  day?: number;    // 일간 (1-31)
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

