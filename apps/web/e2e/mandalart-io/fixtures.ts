import { DEFAULT_COLORS } from '../../src/lib/constants';
import { GRID_POSITIONS, MandalartData } from '../../src/types/mandalart';

export function planFixture(): MandalartData {
  return {
    id: 'io-plan', title: '만다라트 백업 · Goals 🚀', category: 'monthly', template: 'mandalart',
    year: 2026, month: 9, createdAt: '2026-09-01T01:02:03.000Z', updatedAt: '2026-09-25T12:34:56.000Z',
    grids: GRID_POSITIONS.map((id, gridIndex) => ({
      id, color: DEFAULT_COLORS[id],
      cells: Array.from({ length: 9 }, (_, position) => ({
        id: `${id}-${position}`, position, value: `계획 ${gridIndex * 9 + position + 1}\nGoal ${gridIndex * 9 + position + 1}`,
        ...(position === 0 ? { completed: true } : {}),
        ...(position === 2 ? { icon: '🚀' } : {}),
        ...(position === 6 ? { schedule: { repeat: 'weekly' as const, repeatDays: [1, 3, 5], targetMonths: [9, 10], startDate: '2026-09-01', endDate: '2026-10-31' } } : {}),
      })),
    })),
  };
}
