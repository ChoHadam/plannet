import { test, expect } from '@playwright/test';
import {
  AIRequestContext,
  ALL_SUB_GOALS_FILLED_MESSAGE,
  CELLS_PRESERVED_MESSAGE,
  findStaleReason,
  GRID_CHANGED_MESSAGE,
  NO_EMPTY_SUB_GOAL_MESSAGE,
  planGridAction,
  snapshotGridValues,
} from '../../src/lib/aiResponseSafety';
import { buildPlan, CellValues } from './fixtures';
import { useMandalartStore } from '../../src/hooks/useMandalart';

// 브라우저 없이 lib/aiResponseSafety.ts의 판단 규칙만 검사한다.

const ACTIONS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

function context(values: CellValues, overrides: Partial<AIRequestContext> = {}): AIRequestContext {
  return { generation: 1, storageScope: 'acct:a', planId: 'plan-a', resetToken: null, snapshot: snapshotGridValues(buildPlan('plan-a', 'A', values)), ...overrides };
}

test.describe('findStaleReason', () => {
  const values: CellValues = { center: { 4: '건강' } };
  const plan = buildPlan('plan-a', 'A', values);
  const ok = { generation: 1, storageScope: 'acct:a', planId: 'plan-a', resetToken: null, plan };

  test('같은 세대·범위·플랜이면 적용 가능', () => {
    expect(findStaleReason(context(values), ok)).toBeNull();
  });

  test('세대가 바뀌면(A→B→A 재선택, 초기화, 닫기) 버린다', () => {
    expect(findStaleReason(context(values), { ...ok, generation: 2 })).toBe('superseded');
  });

  test('초기화 토큰이 다르면 같은 ID·시각·빈 셀 값이어도 버린다', () => {
    const blank = buildPlan('plan-a', 'A', {});
    const resetToken = {};
    expect(findStaleReason(context({}), { ...ok, plan: blank, resetToken })).toBe('plan-reset');
    expect(findStaleReason(context({}, { resetToken }), { ...ok, plan: blank, resetToken })).toBeNull();
    expect(findStaleReason(context({}, { resetToken }), { ...ok, plan: blank, resetToken: {} })).toBe('plan-reset');
  });

  test('계정 저장 범위가 다르거나 확인되지 않으면 버린다', () => {
    expect(findStaleReason(context(values), { ...ok, storageScope: 'acct:b' })).toBe('scope-changed');
    expect(findStaleReason(context(values), { ...ok, storageScope: null })).toBe('scope-changed');
  });

  test('다른 플랜이 선택됐거나 플랜이 삭제됐으면 버린다', () => {
    expect(findStaleReason(context(values), { ...ok, planId: 'plan-b', plan: buildPlan('plan-b', 'B', {}) })).toBe('plan-changed');
    expect(findStaleReason(context(values), { ...ok, planId: null, plan: null })).toBe('plan-changed');
    expect(findStaleReason(context(values), { ...ok, plan: null })).toBe('plan-missing');
  });
});

test.describe('destructive plan replacement', () => {
  test.beforeEach(() => {
    useMandalartStore.setState({ mandalarts: [buildPlan('plan-a', 'A', {})], currentId: 'plan-a', resetToken: null });
  });

  test('빈 플랜 초기화는 동기 알림에서 구분되고 반복 초기화·수동 편집도 올바르게 구분한다', () => {
    const request = context({});
    const observed: string[] = [];
    const unsubscribe = useMandalartStore.subscribe((state) => {
      const stale = findStaleReason(request, {
        generation: request.generation,
        storageScope: request.storageScope,
        planId: state.currentId,
        resetToken: state.resetToken,
        plan: state.mandalarts[0],
      });
      if (stale) observed.push(stale);
    });
    try {
      useMandalartStore.getState().resetCurrent();
      expect(observed).toEqual(['plan-reset']);
      const first = useMandalartStore.getState().resetToken;
      useMandalartStore.getState().resetCurrent();
      const second = useMandalartStore.getState().resetToken;
      expect(second).not.toBe(first);
      useMandalartStore.getState().updateCell('center', 0, '수동 편집');
      expect(useMandalartStore.getState().resetToken).toBe(second);
    } finally {
      unsubscribe();
    }
  });

  test('가져온 플랜은 local ID를 유지하며 한 번의 알림으로 내용·날짜·토큰을 교체한다', () => {
    const before = useMandalartStore.getState();
    const imported = {
      ...buildPlan('foreign-id', '가져온 플랜', { center: { 4: '새 목표' } }),
      category: 'weekly' as const,
      year: 2030,
      month: 12,
      week: 5,
    };
    imported.grids[0].cells[0].schedule = { repeat: 'daily' };
    const notifications: { id: string; goal: string; token: object | null }[] = [];
    const unsubscribe = useMandalartStore.subscribe((state) => notifications.push({
      id: state.mandalarts[0].id,
      goal: state.mandalarts[0].grids.find((grid) => grid.id === 'center')!.cells[4].value,
      token: state.resetToken,
    }));
    try {
      expect(useMandalartStore.getState().replaceCurrentMandalart(imported)).toBe(true);
      const after = useMandalartStore.getState();
      expect(after.currentId).toBe('plan-a');
      expect(after.mandalarts).not.toBe(before.mandalarts);
      expect(before.mandalarts[0]).toEqual(buildPlan('plan-a', 'A', {}));
      expect(after.mandalarts[0]).toEqual({ ...imported, id: 'plan-a', updatedAt: expect.any(String) });
      expect(imported.id).toBe('foreign-id');
      expect(after.mandalarts[0].updatedAt).not.toBe(imported.updatedAt);
      expect(notifications).toEqual([{ id: 'plan-a', goal: '새 목표', token: after.resetToken }]);
      expect(after.resetToken).not.toBe(before.resetToken);
    } finally {
      unsubscribe();
    }
  });

  test('선택된 플랜이 없으면 가져오기·초기화는 상태와 토큰을 바꾸지 않는다', () => {
    useMandalartStore.setState({ currentId: 'missing' });
    const before = useMandalartStore.getState();
    expect(before.replaceCurrentMandalart(buildPlan('foreign-id', 'Imported', {}))).toBe(false);
    before.resetCurrent();
    expect(useMandalartStore.getState()).toBe(before);
  });
});

test.describe('planGridAction', () => {
  test('변경이 없으면 기존 규칙대로 첫 빈 하위 목표와 외곽 그리드를 채운다', () => {
    const values: CellValues = { center: { 4: '건강' } };
    const result = planGridAction('generate_actions', { subGoal: '운동', actions: ACTIONS }, context(values).snapshot, buildPlan('plan-a', 'A', values));
    expect(result.assisted).toBe(true);
    expect(result.notice).toBeNull();
    expect(result.writes).toEqual([
      { gridId: 'center', cellIndex: 0, value: '운동' },
      { gridId: 'top-left', cellIndex: 4, value: '운동' },
      ...[0, 1, 2, 3, 5, 6, 7, 8].map((cellIndex, idx) => ({ gridId: 'top-left', cellIndex, value: ACTIONS[idx] })),
    ]);
  });

  test('기다리는 동안 사용자가 채운 하위 목표 칸은 건너뛰고 다음 빈 칸을 쓴다', () => {
    const before: CellValues = { center: { 4: '건강' } };
    const now = buildPlan('plan-a', 'A', { center: { 4: '건강', 0: '내가 쓴 목표' }, 'top-left': { 4: '내가 쓴 목표' } });
    const result = planGridAction('set_sub_goal', { subGoal: '운동' }, context(before).snapshot, now);
    expect(result.writes).toEqual([{ gridId: 'center', cellIndex: 1, value: '운동' }]);
  });

  test('기다리는 동안 사용자가 비운 칸도 새로 채우지 않는다', () => {
    const before: CellValues = { center: { 4: '건강', 0: '독서', 1: '저축', 2: 'x', 3: 'x', 5: 'x', 6: 'x', 7: 'x', 8: 'x' } };
    const now = buildPlan('plan-a', 'A', { center: { 4: '건강', 1: '저축', 2: 'x', 3: 'x', 5: 'x', 6: 'x', 7: 'x', 8: 'x' } });
    const result = planGridAction('generate_actions', { subGoal: '운동', actions: ACTIONS }, context(before).snapshot, now);
    expect(result.writes).toEqual([]);
    expect(result.assisted).toBe(false);
    expect(result.notice).toBe(CELLS_PRESERVED_MESSAGE);
  });

  test('기다리는 동안 수정한 실천 계획 칸은 덮어쓰지 않는다', () => {
    const before: CellValues = { center: { 4: '건강' }, 'top-left': { 0: '기존 계획' } };
    const now = buildPlan('plan-a', 'A', { center: { 4: '건강' }, 'top-left': { 0: '방금 고친 계획', 2: '새로 쓴 계획' } });
    const result = planGridAction('generate_actions', { subGoal: '운동', actions: ACTIONS }, context(before).snapshot, now);
    const outerWrites = result.writes.filter((w) => w.gridId === 'top-left').map((w) => w.cellIndex);
    expect(outerWrites).toEqual([4, 1, 3, 5, 6, 7, 8]);
    expect(result.assisted).toBe(true);
    expect(result.notice).toBe(CELLS_PRESERVED_MESSAGE);
  });

  test('요청 전부터 있던 실천 계획은 기존처럼 AI 응답으로 덮어쓴다', () => {
    const values: CellValues = { center: { 4: '건강' }, 'top-left': { 0: '기존 계획' } };
    const result = planGridAction('generate_actions', { subGoal: '운동', actions: ACTIONS }, context(values).snapshot, buildPlan('plan-a', 'A', values));
    expect(result.writes).toContainEqual({ gridId: 'top-left', cellIndex: 0, value: 'a1' });
    expect(result.notice).toBeNull();
  });

  test('핵심 목표가 바뀌었으면(플랜 초기화 포함) 그리드에 쓰지 않는다', () => {
    const before: CellValues = { center: { 4: '건강' } };
    for (const action of ['set_core_goal', 'set_sub_goal', 'generate_actions']) {
      const result = planGridAction(action, { coreGoal: '새 목표', subGoal: '운동', actions: ACTIONS }, context(before).snapshot, buildPlan('plan-a', 'A', {}));
      expect(result).toEqual({ writes: [], notice: GRID_CHANGED_MESSAGE, assisted: false, endConversation: false });
    }
  });

  test('핵심 목표는 비어 있을 때만 설정한다', () => {
    const empty: CellValues = {};
    expect(planGridAction('set_core_goal', { coreGoal: '건강' }, context(empty).snapshot, buildPlan('plan-a', 'A', empty)).writes)
      .toEqual([{ gridId: 'center', cellIndex: 4, value: '건강' }]);
    const filled: CellValues = { center: { 4: '기존' } };
    expect(planGridAction('set_core_goal', { coreGoal: '건강' }, context(filled).snapshot, buildPlan('plan-a', 'A', filled)).writes).toEqual([]);
  });

  test('슬롯이 요청 전부터 모두 차 있으면 기존 안내를 유지한다', () => {
    const full: CellValues = { center: { 0: 'x', 1: 'x', 2: 'x', 3: 'x', 5: 'x', 6: 'x', 7: 'x', 8: 'x' } };
    const plan = buildPlan('plan-a', 'A', full);
    expect(planGridAction('set_sub_goal', { subGoal: '운동' }, context(full).snapshot, plan).notice).toBe(ALL_SUB_GOALS_FILLED_MESSAGE);
    expect(planGridAction('generate_actions', { subGoal: '운동', actions: ACTIONS }, context(full).snapshot, plan).notice).toBe(NO_EMPTY_SUB_GOAL_MESSAGE);
  });

  test('end_conversation과 알 수 없는 action', () => {
    const plan = buildPlan('plan-a', 'A', {});
    expect(planGridAction('end_conversation', undefined, context({}).snapshot, plan).endConversation).toBe(true);
    expect(planGridAction('none', { subGoal: 'x' }, context({}).snapshot, plan).writes).toEqual([]);
  });
});
