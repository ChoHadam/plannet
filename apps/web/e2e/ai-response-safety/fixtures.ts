import { GRID_POSITIONS, GridPosition, MandalartData } from '../../src/types/mandalart';
import { DEFAULT_COLORS } from '../../src/lib/constants';

/** gridId → { cellIndex: value } */
export type CellValues = Partial<Record<GridPosition, Record<number, string>>>;

export const FIXED_TIME = '2026-01-01T00:00:00.000Z';

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

/** 모의 /me가 돌려주는 내부 사용자 UUID (서버 저장 모드) */
export function accountUserId(account: TestAccount): string {
  return account.subject === ACCOUNT_A.subject ? 'a1a1a1a1-0000-4000-8000-00000000000a' : 'b2b2b2b2-0000-4000-8000-00000000000b';
}
