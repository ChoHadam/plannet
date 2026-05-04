import { MonthlyData, WeeklyFocus } from '@/types/monthly';

/**
 * Monday-anchored week-of-month → 7개 날짜(월~일) 배열 반환.
 * useBlock6.ts의 getWeekNumberInMonth와 정렬된 정의.
 *
 * - Week 1의 월요일 = 해당 월의 첫 번째 월요일
 *   (단, 1일이 화~일이면 1일이 속한 주를 W1으로 보고 그 주의 월요일은 전월에 위치)
 * - 반환 배열은 [월, 화, 수, 목, 금, 토, 일] 순
 * - 월 경계를 넘는 날짜도 정확히 반환 (전/다음 월 날짜 포함 가능)
 *
 * 예: 2026-04은 4월 1일이 수요일이므로
 *   W1 월요일 = 2026-03-30, W2 = 2026-04-06 ...
 */
export function getWeekDates(year: number, month: number, weekNumber: number): Date[] {
  // 월 1일의 요일 (0=일, 1=월, ..., 6=토)
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstOfMonth.getDay();
  // 1일이 속한 주의 월요일 날짜 오프셋 (음수 가능 = 전월)
  // 1일이 일(0) → 다음 주 월요일을 W1 첫날로? 한국 관습은 보통 그 주를 1주차로 봄.
  // useBlock6의 getWeekNumberInMonth는 firstMondayDate를 1일 이후 첫 월요일로 계산.
  // 그러나 1일이 화~일이면 1일이 W1에 속해야 자연스러움.
  // 절충: 1일을 포함하는 주의 월요일 = W1 시작.
  const daysToFirstMonday = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
  // daysToFirstMonday: 0이면 1일이 월요일, -1이면 1일이 화 → 월요일은 -1일 (전일)
  const week1Monday = new Date(year, month - 1, 1 + daysToFirstMonday);

  // weekNumber 만큼 7일씩 더한 월요일이 시작점
  const startMonday = new Date(week1Monday);
  startMonday.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);

  // 월~일 7개
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * 날짜가 해당 월의 몇 번째 주인지 계산 (1-5)
 * 해당 월 1일이 속한 주를 W1으로 계산
 */
export function getWeekOfMonth(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // 해당 월 1일의 요일 (0=일, 6=토)
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // 첫 주의 남은 일수 (일요일 시작 기준)
  const daysInFirstWeek = 7 - firstDayOfMonth;

  if (day <= daysInFirstWeek) return 1;

  const weekNumber = Math.ceil((day - daysInFirstWeek) / 7) + 1;

  // 최대 W5로 제한 (일부 달은 6주까지 있을 수 있음)
  return Math.min(weekNumber, 5);
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
