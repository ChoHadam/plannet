import { GRID_POSITIONS, GridPosition, MandalartData } from '../../src/types/mandalart';
import { DEFAULT_COLORS, STORAGE_KEY } from '../../src/lib/constants';
import { accountStorageScope } from '../../src/lib/plannerStorage';

/** gridId → { cellIndex: value } */
export type CellValues = Partial<Record<GridPosition, Record<number, string>>>;

export const FIXED_TIME = '2026-01-01T00:00:00.000Z';
/** useMandalart persist version */
const MANDALART_PERSIST_VERSION = 3;

export function buildPlan(id: string, title: string, values: CellValues): MandalartData {
  return {
    id,
    title,
    category: 'annual',
    template: 'mandalart',
    grids: GRID_POSITIONS.map((position) => ({
      id: position,
      color: DEFAULT_COLORS[position],
      cells: Array.from({ length: 9 }, (_, i) => ({
        id: `${position}-${i}`,
        value: values[position]?.[i] ?? '',
        position: i,
      })),
    })),
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    year: 2026,
  };
}

export interface TestAccount {
  subject: string;
  name: string;
}

export const ACCOUNT_A: TestAccount = { subject: 'airs-sub-a', name: 'Airs Tester A' };
export const ACCOUNT_B: TestAccount = { subject: 'airs-sub-b', name: 'Airs Tester B' };

/** 계정별 Mandalart LocalStorage 키 (plannerStorage의 규칙과 같다) */
export function mandalartKey(account: TestAccount): string {
  return `${STORAGE_KEY}@${accountStorageScope(`google:${account.subject}`)}`;
}

export function persistedMandalarts(plans: MandalartData[], currentId: string | null): string {
  return JSON.stringify({ state: { mandalarts: plans, currentId }, version: MANDALART_PERSIST_VERSION });
}
