import { MandalartData, CENTER_TO_OUTER_MAP, GridPosition } from '@/types/mandalart';

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
            .map((actionPos, idx) => {
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
 * 만다라트의 핵심 목표 텍스트 추출
 */
export function getMainGoalText(mandalartData: MandalartData): string {
  const centerGrid = mandalartData.grids.find(g => g.id === 'center');
  return centerGrid?.cells[4]?.value || '';
}
