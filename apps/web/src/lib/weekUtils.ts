import type { MonthlyData, WeeklyFocus } from '@/types/monthly';

/**
 * 주차 공통 규칙 (Monthly·Block6·Daily·날짜 선택기 모두 이 파일만 쓴다)
 * - 한 주는 월요일~일요일
 * - 그 달 1일이 들어 있는 주가 W1. 1일이 화~일이면 W1의 월요일은 전월에 있다
 * - 그 달 날짜가 하루라도 들어 있는 주까지 센다 → 한 달은 4·5·6주
 *
 * 예: 2026-03은 1일이 일요일이라 W1 = 2/23~3/1, 3/30~4/5가 W6
 */

/** 한 달이 가질 수 있는 최대 주 수 */
export const MAX_WEEKS_IN_MONTH = 6;
const DAYS_PER_WEEK = 7;

/** 월요일부터 시작하는 요일 이름. 인덱스는 mondayIndex()와 같다 */
export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
export const SATURDAY_INDEX = 5;
export const SUNDAY_INDEX = 6;

/** 월요일 = 0 … 일요일 = 6 */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % DAYS_PER_WEEK;
}

/** 해당 월 weekNumber 주의 7개 날짜 [월 … 일]. 전·다음 달 날짜도 실제 날짜로 들어 있다 */
export function getWeekDates(year: number, month: number, weekNumber: number): Date[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const week1Monday = new Date(year, month - 1, 1 - mondayIndex(firstOfMonth));
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) =>
    new Date(week1Monday.getFullYear(), week1Monday.getMonth(), week1Monday.getDate() + (weekNumber - 1) * DAYS_PER_WEEK + i));
}

export interface WeekOfMonthMeta {
  weekOfMonth: number;
  start: Date;
  end: Date;
  dates: Date[];
}

export function getWeeksOfMonth(year: number, month: number): WeekOfMonthMeta[] {
  const lastOfMonth = new Date(year, month, 0);
  const weeks: WeekOfMonthMeta[] = [];

  for (let weekOfMonth = 1; weekOfMonth <= MAX_WEEKS_IN_MONTH; weekOfMonth += 1) {
    const dates = getWeekDates(year, month, weekOfMonth);
    weeks.push({ weekOfMonth, start: dates[0], end: dates[DAYS_PER_WEEK - 1], dates });
    if (dates[DAYS_PER_WEEK - 1].getTime() >= lastOfMonth.getTime()) break;
  }

  return weeks;
}

/** 해당 월의 주 수 (4·5·6) */
export function getWeekCountInMonth(year: number, month: number): number {
  return getWeeksOfMonth(year, month).length;
}

export const isDateInMonth = (date: Date, year: number, month: number) =>
  date.getFullYear() === year && date.getMonth() + 1 === month;

/** 날짜가 그 날짜가 속한 달의 몇 번째 주인지 */
export function getWeekOfMonth(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const target = new Date(year, month - 1, date.getDate()).getTime();
  const week = getWeeksOfMonth(year, month).find(
    (w) => w.start.getTime() <= target && target <= w.end.getTime()
  );

  return week?.weekOfMonth ?? 1;
}

export interface CurrentWeeklyFocusResult {
  focus: WeeklyFocus | null;
  monthlyPlan: MonthlyData | null;
  weekNumber: number;
}

/**
 * 현재 날짜 기준으로 해당하는 주간 포커스 가져오기
 * 같은 year/month의 월간 플래너에서 해당 주차의 포커스를 반환
 */
export function getCurrentWeeklyFocus(
  monthlyPlans: MonthlyData[],
  date: Date = new Date()
): CurrentWeeklyFocusResult {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const weekNumber = getWeekOfMonth(date);

  // 해당 year/month의 월간 플래너 찾기 (최신 것 우선)
  const matchingPlan = monthlyPlans.find(
    (plan) => plan.year === year && plan.month === month
  );

  if (!matchingPlan) {
    return { focus: null, monthlyPlan: null, weekNumber };
  }

  // 해당 주차의 포커스 찾기
  const focus = matchingPlan.weeklyFocus.find(
    (wf) => wf.weekNumber === weekNumber
  );

  return {
    focus: focus || null,
    monthlyPlan: matchingPlan,
    weekNumber,
  };
}
