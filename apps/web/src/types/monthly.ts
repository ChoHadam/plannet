import { PlanCategory } from './mandalart';
import { getWeekCountInMonth, MAX_WEEKS_IN_MONTH } from '@/lib/weekUtils';

export interface MonthlyGoal {
  id: string;
  text: string;
  progress: number; // 0-100
  completed: boolean;
  sourceMandalartId?: string; // 출처 만다라트 ID (불러오기 추적용)
  sourceCellId?: string; // 출처 셀 ID (예: "top-left-3", 동기화용)
}

export interface WeeklyFocus {
  weekNumber: number; // 1..MAX_WEEKS_IN_MONTH (주차 규칙: lib/weekUtils)
  text: string;
}

export interface MonthlyData {
  id: string;
  title: string;
  category: PlanCategory;
  template: 'monthly';
  year: number;
  month: number; // 1-12
  goals: MonthlyGoal[]; // max 5
  weeklyFocus: WeeklyFocus[]; // W1~W5(이전 플랜) 또는 W1~W6. 그 달에 없는 주의 내용도 지우지 않는다
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** W6 도입 전 플랜의 주간 포커스 수. 이 모양 그대로 읽고 저장하며 읽기만으로 바꾸지 않는다 */
export const LEGACY_WEEKLY_FOCUS_WEEKS = 5;
/** 저장 계약이 받는 주간 포커스 수 (API PlannerValidator와 같다) */
export const WEEKLY_FOCUS_WEEK_COUNTS: readonly number[] = [LEGACY_WEEKLY_FOCUS_WEEKS, MAX_WEEKS_IN_MONTH];

/** 새 플랜은 W1~W6을 모두 가진다. 화면은 그 달의 주 수만큼만 보여 준다 */
export function createInitialWeeklyFocus(): WeeklyFocus[] {
  return Array.from({ length: MAX_WEEKS_IN_MONTH }, (_, i) => ({ weekNumber: i + 1, text: '' }));
}

/** 저장 계약: 주 번호가 1~5 또는 1~6을 빠짐·중복 없이 한 번씩(순서 무관) */
export function isValidWeeklyFocusWeeks(weekNumbers: readonly unknown[]): boolean {
  if (!WEEKLY_FOCUS_WEEK_COUNTS.includes(weekNumbers.length)) return false;
  const seen = new Set<unknown>(weekNumbers);
  return seen.size === weekNumbers.length && weekNumbers.every((n) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= weekNumbers.length);
}

/**
 * weekNumber 주의 텍스트를 바꾼 배열. 내용이 같으면 원본을 그대로 돌려준다(쓰기 없음).
 * 이전 5주 플랜에 없는 W6은 내용을 적을 때만 끝에 추가한다. 기존 항목은 그대로 둔다.
 */
export function withWeeklyFocusText(weeklyFocus: WeeklyFocus[], weekNumber: number, text: string): WeeklyFocus[] {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEKS_IN_MONTH) return weeklyFocus;
  const index = weeklyFocus.findIndex((w) => w.weekNumber === weekNumber);
  if (index !== -1) {
    if (weeklyFocus[index].text === text) return weeklyFocus;
    const next = [...weeklyFocus];
    next[index] = { ...next[index], text };
    return next;
  }
  if (!text) return weeklyFocus;
  const present = new Set(weeklyFocus.map((w) => w.weekNumber));
  const missing = Array.from({ length: weekNumber }, (_, i) => i + 1).filter((n) => !present.has(n));
  return [...weeklyFocus, ...missing.map((n) => ({ weekNumber: n, text: n === weekNumber ? text : '' }))];
}

export interface WeeklyFocusRow {
  weekNumber: number;
  text: string;
  /** false: 날짜를 옮기거나 복제해 이 달에는 없는 주. 내용을 보관해 보여 준다 */
  inMonth: boolean;
}

/** 화면 행: 그 달의 주(4·5·6)는 모두, 그 달에 없는 주는 내용이 있을 때만 */
export function getWeeklyFocusRows(plan: Pick<MonthlyData, 'year' | 'month' | 'weeklyFocus'>): WeeklyFocusRow[] {
  const weekCount = getWeekCountInMonth(plan.year, plan.month);
  const textOf = new Map(plan.weeklyFocus.map((w) => [w.weekNumber, w.text]));
  const rows: WeeklyFocusRow[] = Array.from({ length: weekCount }, (_, i) => ({
    weekNumber: i + 1, text: textOf.get(i + 1) ?? '', inMonth: true,
  }));
  const retained = plan.weeklyFocus
    .filter((w) => w.weekNumber > weekCount && w.text)
    .sort((a, b) => a.weekNumber - b.weekNumber);
  return [...rows, ...retained.map((w) => ({ weekNumber: w.weekNumber, text: w.text, inMonth: false }))];
}
