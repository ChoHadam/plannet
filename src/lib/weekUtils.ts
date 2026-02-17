import { MonthlyData, WeeklyFocus } from '@/types/monthly';

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
