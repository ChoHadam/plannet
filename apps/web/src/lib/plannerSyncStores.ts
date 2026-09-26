import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { useRecurringStore } from '@/hooks/useRecurring';
import { useHolidayStore } from '@/hooks/useHolidays';
import { MandalartData } from '@/types/mandalart';
import { Block6Data } from '@/types/block6';
import { MonthlyData } from '@/types/monthly';
import { DailyData } from '@/types/daily';
import { RecurringTodo } from '@/types/recurring';
import { ManualHolidayMap } from '@/lib/holidays';
import { PlannerData, PlannerDocument, PlannerKind, PlannerSyncError } from '@/lib/plannerSync';
import { PLANNER_STORAGE_KEYS, scopedKey } from '@/lib/plannerStorage';
import { sanitizeInput } from '@/lib/sanitize';

export const PLANNER_STORES = [useMandalartStore, useBlock6Store, useMonthlyStore, useDailyStore, useRecurringStore, useHolidayStore];

const PLAN_ARRAY_FIELDS = { mandalart: 'mandalarts', block6: 'block6Plans', monthly: 'monthlyPlans', daily: 'dailyPlans' } as const;

export function readPlannerDocuments(): PlannerDocument[] {
  const documents: PlannerDocument[] = [];
  const collections = {
    mandalart: useMandalartStore.getState().mandalarts,
    block6: useBlock6Store.getState().block6Plans,
    monthly: useMonthlyStore.getState().monthlyPlans,
    daily: useDailyStore.getState().dailyPlans,
  };
  for (const [kind, plans] of Object.entries(collections)) {
    for (const plan of plans) documents.push({ kind: kind as PlannerKind, id: plan.id, data: plan as unknown as PlannerData });
  }
  documents.push({ kind: 'recurring', id: 'default', data: { todos: useRecurringStore.getState().todos } });
  documents.push({ kind: 'holidays', id: 'default', data: { manualHolidays: useHolidayStore.getState().manualHolidays } });
  return documents;
}

function validateDocument(document: PlannerDocument): void {
  const { kind, id, data } = document;
  const object = (value: unknown): value is PlannerData => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = (value: unknown) => typeof value === 'string';
  const optionalText = (value: unknown) => value === undefined || text(value);
  const integer = (value: unknown) => typeof value === 'number' && Number.isInteger(value);
  const list = (value: unknown, valid: (item: PlannerData) => boolean) => Array.isArray(value) && value.every((item: unknown) => object(item) && valid(item));
  const todo = (item: PlannerData) => text(item.id) && text(item.text) && typeof item.completed === 'boolean' && optionalText(item.color)
    && optionalText(item.sourceType) && optionalText(item.sourceId) && optionalText(item.sourceCellId);
  const require = (valid: unknown) => { if (!valid) throw new PlannerSyncError('invalid_response'); };
  require(object(data));
  if (kind === 'recurring') {
    require(id === 'default' && list(data.todos, (item) => text(item.id) && text(item.text) && text(item.createdAt) && optionalText(item.color)));
  } else if (kind === 'holidays') {
    require(id === 'default' && object(data.manualHolidays) && Object.values(data.manualHolidays).every((item) => object(item) && text(item.date) && text(item.createdAt) && optionalText(item.name)));
  } else {
    require(data.id === id && data.template === kind && text(data.title) && ['annual', 'monthly', 'weekly', 'daily'].includes(String(data.category))
      && text(data.createdAt) && text(data.updatedAt));
    if (kind === 'mandalart') {
      require(list(data.grids, (grid) => text(grid.id) && text(grid.color) && list(grid.cells, (cell) => text(cell.id) && integer(cell.position) && text(cell.value)
        && (cell.completed === undefined || typeof cell.completed === 'boolean') && optionalText(cell.icon)
        && (cell.schedule === undefined || (object(cell.schedule)
          && optionalText(cell.schedule.startDate) && optionalText(cell.schedule.endDate) && optionalText(cell.schedule.repeat)
          && (cell.schedule.targetMonths === undefined || (Array.isArray(cell.schedule.targetMonths) && cell.schedule.targetMonths.every(integer)))
          && (cell.schedule.repeatDays === undefined || (Array.isArray(cell.schedule.repeatDays) && cell.schedule.repeatDays.every(integer))))))));
    } else if (kind === 'block6') {
      require(list(data.backlog, todo) && list(data.blocks, (block) => text(block.id) && text(block.day) && integer(block.blockNumber) && text(block.keyword) && optionalText(block.color) && list(block.todos, todo)));
    } else if (kind === 'monthly') {
      require(integer(data.year) && integer(data.month) && text(data.memo)
        && list(data.goals, (goal) => text(goal.id) && text(goal.text) && typeof goal.progress === 'number' && typeof goal.completed === 'boolean' && optionalText(goal.sourceMandalartId) && optionalText(goal.sourceCellId))
        && list(data.weeklyFocus, (focus) => integer(focus.weekNumber) && text(focus.text)));
    } else {
      require(integer(data.year) && integer(data.month) && integer(data.day) && text(data.memo) && list(data.todos, todo));
    }
  }
}

export function applyPlannerDocuments(documents: PlannerDocument[]): void {
  documents.forEach(validateDocument);
  const byKind = (kind: PlannerKind) => documents.filter((document) => document.kind === kind).map((document) => document.data);
  const mandalarts = byKind('mandalart') as unknown as MandalartData[];
  const block6Plans = byKind('block6') as unknown as Block6Data[];
  const monthlyPlans = byKind('monthly') as unknown as MonthlyData[];
  const dailyPlans = byKind('daily') as unknown as DailyData[];
  const exists = (plans: { id: string }[], id: string | null) => id && plans.some((plan) => plan.id === id) ? id : null;
  // Wholesale replacement must invalidate any pending AI response, even if IDs are unchanged.
  useMandalartStore.setState((state) => ({ mandalarts, currentId: exists(mandalarts, state.currentId), resetToken: {} }));
  useBlock6Store.setState((state) => ({ block6Plans, currentBlock6Id: exists(block6Plans, state.currentBlock6Id) }));
  useMonthlyStore.setState((state) => ({ monthlyPlans, currentMonthlyId: exists(monthlyPlans, state.currentMonthlyId) }));
  useDailyStore.setState((state) => ({ dailyPlans, currentDailyId: exists(dailyPlans, state.currentDailyId) }));
  useRecurringStore.setState({ todos: (byKind('recurring')[0]?.todos ?? []) as RecurringTodo[] });
  useHolidayStore.setState({ manualHolidays: (byKind('holidays')[0]?.manualHolidays ?? {}) as ManualHolidayMap });
}

/** Read-only import: all original keys/IDs/references remain untouched. */
export function readLegacyDocuments(scope: string, storage: Pick<Storage, 'getItem'> = localStorage): PlannerDocument[] {
  const documents: PlannerDocument[] = [];
  for (const [kind, key] of Object.entries(PLANNER_STORAGE_KEYS) as [PlannerKind, string][]) {
    const raw = storage.getItem(scopedKey(key, scope));
    if (!raw) continue;
    const parsed = JSON.parse(raw) as { version?: number; state?: Record<string, unknown> };
    const state = parsed.state;
    if (!state || typeof state !== 'object') throw new Error('읽을 수 없는 이전 기록이 있어요. 원본은 그대로 보관했어요.');
    if (kind === 'recurring') {
      if (Array.isArray(state.todos) && state.todos.length) documents.push({ kind, id: 'default', data: { todos: state.todos } });
    } else if (kind === 'holidays') {
      if (state.manualHolidays && Object.keys(state.manualHolidays).length) documents.push({ kind, id: 'default', data: { manualHolidays: state.manualHolidays } });
    } else {
      const plans = state[PLAN_ARRAY_FIELDS[kind]];
      if (!Array.isArray(plans)) throw new Error('이전 기록의 형식을 확인하지 못했어요. 원본은 그대로 보관했어요.');
      for (const plan of plans as PlannerData[]) {
        let data = plan;
        if (kind === 'mandalart' && parsed.version === 2) {
          data = { ...plan, grids: (plan.grids as { cells: (PlannerData & { isDaily?: boolean })[] }[]).map((grid) => ({ ...grid, cells: grid.cells.map(({ isDaily, ...cell }) => isDaily ? { ...cell, schedule: { repeat: 'daily' } } : cell) })) };
        }
        if (kind === 'block6' && (parsed.version ?? 0) < 2) data = { ...plan, backlog: plan.backlog ?? [] };
        documents.push({ kind, id: String(data.id), data });
      }
    }
  }
  // Plain text is sanitized at the import boundary; JSON extension fields are retained.
  const sanitized = JSON.parse(JSON.stringify(documents), (_key, value: unknown) => typeof value === 'string' ? sanitizeInput(value) : value) as PlannerDocument[];
  sanitized.forEach(validateDocument);
  return sanitized;
}

export function hasLegacyDocuments(scope: string): boolean {
  try {
    return (Object.entries(PLANNER_STORAGE_KEYS) as [PlannerKind, string][]).some(([kind, key]) => {
      const raw = localStorage.getItem(scopedKey(key, scope));
      if (!raw) return false;
      try {
        const state = (JSON.parse(raw) as { state?: PlannerData }).state;
        if (!state) return true;
        const value = state[kind === 'recurring' ? 'todos' : kind === 'holidays' ? 'manualHolidays' : PLAN_ARRAY_FIELDS[kind]];
        return Array.isArray(value) ? value.length > 0 : !!value && typeof value === 'object' && Object.keys(value).length > 0;
      } catch { return true; }
    });
  } catch { return false; }
}
