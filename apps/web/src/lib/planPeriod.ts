import type { PlanCategory } from '@/types/mandalart';

export interface MonthlyPeriod {
  category: PlanCategory;
  year: number;
  month: number;
}

export interface DailyPeriod extends MonthlyPeriod {
  day: number;
}

export function validMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 1 && year <= 9999 &&
    Number.isInteger(month) && month >= 1 && month <= 12;
}

function localDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

/** Clamp a carried day (e.g. January 31 → February 28), never roll into another month. */
export function clampPlanDay(year: number, month: number, day: number): number {
  const lastDay = localDate(year, month + 1, 0).getDate();
  return Math.max(1, Math.min(lastDay, day));
}

export function shiftMonth(period: MonthlyPeriod, direction: 'prev' | 'next'): MonthlyPeriod | null {
  const date = localDate(period.year, period.month + (direction === 'prev' ? -1 : 1), 1);
  const next = { ...period, year: date.getFullYear(), month: date.getMonth() + 1 };
  return validMonth(next.year, next.month) ? next : null;
}

export function shiftDay(period: DailyPeriod, direction: 'prev' | 'next'): DailyPeriod | null {
  const date = localDate(period.year, period.month, period.day + (direction === 'prev' ? -1 : 1));
  const next = { ...period, year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  return validMonth(next.year, next.month) ? next : null;
}

/** Same-period copies remain distinct. Navigation opens newest-created, then smallest ID. */
export function findPeriodPlan<T extends MonthlyPeriod & { id: string; createdAt: string; day?: number }>(
  plans: T[],
  period: MonthlyPeriod | DailyPeriod,
): T | undefined {
  return plans.filter((plan) => plan.category === period.category &&
    plan.year === period.year && plan.month === period.month &&
    (!('day' in period) || plan.day === period.day))
    .sort((a, b) => a.createdAt === b.createdAt
      ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      : (a.createdAt > b.createdAt ? -1 : 1))[0];
}
