import { CENTER_TO_OUTER_MAP, GridPosition, MandalartData } from '@/types/mandalart';

/**
 * AI 채팅 응답을 "요청을 보낸 시점의 문맥"에만 적용하기 위한 순수 함수 모음.
 *
 * - 요청마다 세대(generation)·계정 저장 범위·플랜 ID·초기화 토큰·그리드 스냅샷을 기록한다.
 * - 응답 처리 직전에 세대·범위·플랜이 그대로인지 확인한다. 하나라도 다르면 응답을 버린다.
 * - 그리드 변경은 최신 store 값 기준으로 계산하고, 응답을 기다리는 동안 사용자가 바꾼 셀은 건드리지 않는다.
 * - 실제 쓰기는 store의 updateCell로만 한다(정제·중앙/외곽 동기화 규칙 유지).
 */

export const CORE_GOAL_INDEX = 4;
/** 중앙 그리드의 하위 목표 칸 (핵심 목표 칸 4 제외) */
export const SUB_GOAL_POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8] as const;
/** 외곽 그리드의 실천 계획 칸 (중앙의 하위 목표 칸과 같은 배치) */
const ACTION_POSITIONS = SUB_GOAL_POSITIONS;

export const ALL_SUB_GOALS_FILLED_MESSAGE =
  '모든 하위 목표 슬롯이 이미 채워져 있어요. 기존 목표를 수정하거나 삭제해주세요.';
export const NO_EMPTY_SUB_GOAL_MESSAGE =
  '비어있는 하위 목표가 없어서 그리드 채우기를 하지 않았어요. 기존 목표를 수정하거나 삭제해주세요.';
export const GRID_CHANGED_MESSAGE =
  '응답을 기다리는 동안 핵심 목표가 바뀌어 그리드에 적용하지 않았어요. 필요하면 다시 요청해주세요.';
export const CELLS_PRESERVED_MESSAGE =
  '응답을 기다리는 동안 직접 수정한 칸은 그대로 두었어요.';

export interface ChatActionData {
  coreGoal?: string;
  subGoal?: string;
  subGoalIndex?: number;
  actions?: string[];
}

/** `${gridId}:${cellIndex}` → 공백을 제거한 셀 값 */
export type GridValueSnapshot = Readonly<Record<string, string>>;

export interface AIRequestContext {
  generation: number;
  storageScope: string | null;
  planId: string;
  resetToken: object | null;
  snapshot: GridValueSnapshot;
}

export interface CurrentRequestState {
  generation: number;
  storageScope: string | null;
  planId: string | null;
  resetToken: object | null;
  plan: MandalartData | null;
}

export type StaleReason = 'superseded' | 'scope-changed' | 'plan-changed' | 'plan-missing' | 'plan-reset';

function cellKey(gridId: GridPosition, cellIndex: number): string {
  return `${gridId}:${cellIndex}`;
}

export function readCellValue(plan: MandalartData | null, gridId: GridPosition, cellIndex: number): string {
  const grid = plan?.grids.find((g) => g.id === gridId);
  return grid?.cells[cellIndex]?.value?.trim() || '';
}

export function snapshotGridValues(plan: MandalartData): GridValueSnapshot {
  const snapshot: Record<string, string> = {};
  for (const grid of plan.grids) {
    grid.cells.forEach((cell, idx) => {
      snapshot[cellKey(grid.id, idx)] = cell.value?.trim() || '';
    });
  }
  return snapshot;
}

/** 응답을 적용해도 되면 null, 아니면 버려야 하는 이유 */
export function findStaleReason(context: AIRequestContext, current: CurrentRequestState): StaleReason | null {
  if (context.generation !== current.generation) return 'superseded';
  if (context.storageScope !== current.storageScope) return 'scope-changed';
  if (context.planId !== current.planId) return 'plan-changed';
  if (!current.plan || current.plan.id !== context.planId) return 'plan-missing';
  if (context.resetToken !== current.resetToken) return 'plan-reset';
  return null;
}

export interface CellWrite {
  gridId: GridPosition;
  cellIndex: number;
  value: string;
}

export interface GridActionPlan {
  writes: CellWrite[];
  /** 사용자에게 붙여 보여줄 경고 (없으면 null) */
  notice: string | null;
  /** 실천 계획 채우기가 실제로 적용됐는지 (진행 횟수 증가 기준) */
  assisted: boolean;
  endConversation: boolean;
}

const EMPTY_PLAN: GridActionPlan = { writes: [], notice: null, assisted: false, endConversation: false };

/**
 * 응답의 action을 최신 플랜에 적용할 셀 쓰기 목록으로 바꾼다.
 * - 쓰기 대상은 요청 시점과 지금 값이 같은 셀만 (기다리는 동안의 사용자 편집 보존)
 * - 새로 채울 하위 목표 칸은 요청 시점에도, 지금도 비어 있는 칸 중에서 고른다
 * - 핵심 목표가 바뀌었으면 대화의 전제가 달라졌으므로 그리드에 쓰지 않는다
 */
export function planGridAction(
  action: string | undefined,
  actionData: ChatActionData | undefined,
  snapshot: GridValueSnapshot,
  plan: MandalartData,
): GridActionPlan {
  if (action === 'end_conversation') return { ...EMPTY_PLAN, endConversation: true };
  if (!actionData) return EMPTY_PLAN;
  if (action !== 'set_core_goal' && action !== 'set_sub_goal' && action !== 'generate_actions') return EMPTY_PLAN;

  if (snapshot[cellKey('center', CORE_GOAL_INDEX)] !== readCellValue(plan, 'center', CORE_GOAL_INDEX)) {
    return { ...EMPTY_PLAN, notice: GRID_CHANGED_MESSAGE };
  }

  const isUnchanged = (gridId: GridPosition, cellIndex: number) =>
    snapshot[cellKey(gridId, cellIndex)] === readCellValue(plan, gridId, cellIndex);
  const findEmptySubGoalSlot = (): number | null =>
    SUB_GOAL_POSITIONS.find((pos) => !readCellValue(plan, 'center', pos) && isUnchanged('center', pos)) ?? null;
  const anySubGoalEditedDuringWait = SUB_GOAL_POSITIONS.some((pos) => !isUnchanged('center', pos));

  switch (action) {
    case 'set_core_goal': {
      // 핵심 목표가 비어 있을 때만 설정 (위에서 요청 시점과 같음을 확인)
      if (!actionData.coreGoal || readCellValue(plan, 'center', CORE_GOAL_INDEX)) return EMPTY_PLAN;
      return { ...EMPTY_PLAN, writes: [{ gridId: 'center', cellIndex: CORE_GOAL_INDEX, value: actionData.coreGoal }] };
    }

    case 'set_sub_goal': {
      if (!actionData.subGoal) return EMPTY_PLAN;
      const slot = findEmptySubGoalSlot();
      if (slot === null) {
        return { ...EMPTY_PLAN, notice: anySubGoalEditedDuringWait ? CELLS_PRESERVED_MESSAGE : ALL_SUB_GOALS_FILLED_MESSAGE };
      }
      return { ...EMPTY_PLAN, writes: [{ gridId: 'center', cellIndex: slot, value: actionData.subGoal }] };
    }

    case 'generate_actions': {
      if (!actionData.subGoal || !actionData.actions) return EMPTY_PLAN;
      const slot = findEmptySubGoalSlot();
      if (slot === null) {
        return { ...EMPTY_PLAN, notice: anySubGoalEditedDuringWait ? CELLS_PRESERVED_MESSAGE : NO_EMPTY_SUB_GOAL_MESSAGE };
      }

      const outerGridId = CENTER_TO_OUTER_MAP[slot];
      const writes: CellWrite[] = [{ gridId: 'center', cellIndex: slot, value: actionData.subGoal }];
      let preserved = false;

      // 외곽 중앙 칸은 중앙 하위 목표와 동기화된다. 사용자가 그 칸을 바꿨다면 하위 목표도 쓰지 않는다.
      if (!isUnchanged(outerGridId, CORE_GOAL_INDEX)) {
        return { ...EMPTY_PLAN, notice: CELLS_PRESERVED_MESSAGE };
      }
      writes.push({ gridId: outerGridId, cellIndex: CORE_GOAL_INDEX, value: actionData.subGoal });

      // 실천 계획 8개 채우기 (기존 값은 덮어쓰되, 기다리는 동안 사용자가 바꾼 칸은 제외)
      actionData.actions.slice(0, ACTION_POSITIONS.length).forEach((item, idx) => {
        const cellIndex = ACTION_POSITIONS[idx];
        if (isUnchanged(outerGridId, cellIndex)) {
          writes.push({ gridId: outerGridId, cellIndex, value: item });
        } else {
          preserved = true;
        }
      });

      return { writes, notice: preserved ? CELLS_PRESERVED_MESSAGE : null, assisted: true, endConversation: false };
    }
  }
  return EMPTY_PLAN;
}
