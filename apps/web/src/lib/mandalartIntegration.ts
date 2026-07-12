import { MandalartData, CENTER_TO_OUTER_MAP, CellSchedule } from '@/types/mandalart';

export interface ActionPlanItem {
  id: string;          // 고유 ID (선택 추적용)
  text: string;        // 실천 계획 텍스트
  subGoalText: string; // 소속 세부 목표 (표시용)
}

export interface GroupedActionPlans {
  subGoalText: string;
  actionPlans: ActionPlanItem[];
}

/**
 * 만다라트에서 세부 목표별로 그룹화된 실천 계획 추출
 *
 * 만다라트 구조:
 * - 중심 그리드 셀 4: 핵심 목표
 * - 중심 그리드 셀 0-3, 5-8: 세부 목표 8개
 * - 외곽 그리드 (8개)의 셀 0-3, 5-8: 실천 계획 (각 8개)
 */
export function extractGroupedActionPlans(
  mandalartData: MandalartData
): GroupedActionPlans[] {
  const centerGrid = mandalartData.grids.find(g => g.id === 'center');
  if (!centerGrid) return [];

  const subGoalPositions = [0, 1, 2, 3, 5, 6, 7, 8];
  const actionPositions = [0, 1, 2, 3, 5, 6, 7, 8];

  return subGoalPositions
    .map(pos => {
      const subGoalText = centerGrid.cells[pos]?.value || '';
      const outerGridId = CENTER_TO_OUTER_MAP[pos];
      const outerGrid = mandalartData.grids.find(g => g.id === outerGridId);

      // 외곽 그리드의 실천 계획 추출
      const actionPlans: ActionPlanItem[] = outerGrid
        ? actionPositions
            .map((actionPos) => {
              const text = outerGrid.cells[actionPos]?.value || '';
              return {
                id: `${outerGridId}-${actionPos}`,
                text,
                subGoalText,
              };
            })
            .filter(item => item.text.trim()) // 비어있지 않은 것만
        : [];

      return {
        subGoalText,
        actionPlans,
      };
    })
    .filter(group => group.subGoalText.trim() && group.actionPlans.length > 0);
}

/**
 * 모든 실천 계획을 플랫 리스트로 추출
 */
export function extractAllActionPlans(
  mandalartData: MandalartData
): ActionPlanItem[] {
  const grouped = extractGroupedActionPlans(mandalartData);
  return grouped.flatMap(group => group.actionPlans);
}

/**
 * 스케줄이 설정된 셀 정보
 */
export interface ScheduledCellItem {
  cellId: string;       // e.g. "top-left-3"
  text: string;
  subGoalText: string;  // 부모 서브골 텍스트
  schedule: CellSchedule;
}

// DailyHabitItem은 기존 호환용 (Block6 등에서 사용)
export type DailyHabitItem = Pick<ScheduledCellItem, 'cellId' | 'text' | 'subGoalText'>;

const ACTION_POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8];

/**
 * 스케줄이 설정된 모든 액션 셀 추출
 */
export function extractScheduledCells(
  mandalartData: MandalartData
): ScheduledCellItem[] {
  const items: ScheduledCellItem[] = [];

  for (const grid of mandalartData.grids) {
    if (grid.id === 'center') continue;

    const subGoalText = grid.cells[4]?.value || '';

    for (const pos of ACTION_POSITIONS) {
      const cell = grid.cells[pos];
      if (cell?.schedule && cell.value.trim()) {
        items.push({
          cellId: `${grid.id}-${pos}`,
          text: cell.value,
          subGoalText,
          schedule: cell.schedule,
        });
      }
    }
  }

  return items;
}

/**
 * 매일 반복(repeat === 'daily') 셀 추출 (기존 호환)
 */
export function extractDailyHabits(
  mandalartData: MandalartData
): DailyHabitItem[] {
  return extractScheduledCells(mandalartData)
    .filter(item => item.schedule.repeat === 'daily')
    .map(({ cellId, text, subGoalText }) => ({ cellId, text, subGoalText }));
}

/**
 * 특정 월에 해당하는 셀 추출
 * - targetMonths에 해당 월 포함 OR
 * - startDate~endDate 범위가 해당 월과 겹침
 */
export function extractCellsForMonth(
  mandalartData: MandalartData,
  year: number,
  month: number
): ScheduledCellItem[] {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // 해당 월 마지막 날

  return extractScheduledCells(mandalartData).filter(item => {
    const { targetMonths, startDate, endDate } = item.schedule;

    if (targetMonths?.includes(month)) return true;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date(9999, 11, 31);
      // 기간이 해당 월과 겹치는지 확인
      return start <= monthEnd && end >= monthStart;
    }

    return false;
  });
}

/**
 * 만다라트의 핵심 목표 텍스트 추출
 */
export function getMainGoalText(mandalartData: MandalartData): string {
  const centerGrid = mandalartData.grids.find(g => g.id === 'center');
  return centerGrid?.cells[4]?.value || '';
}
