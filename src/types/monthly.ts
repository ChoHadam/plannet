import { PlanCategory } from './mandalart';

export interface MonthlyGoal {
  id: string;
  text: string;
  progress: number; // 0-100
  completed: boolean;
  sourceMandalartId?: string; // 출처 만다라트 ID (불러오기 추적용)
}

export interface WeeklyFocus {
  weekNumber: number; // 1-5
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
  weeklyFocus: WeeklyFocus[]; // 5 weeks (W1-W5)
  memo: string;
  createdAt: string;
  updatedAt: string;
}

// Helper functions
export function createInitialWeeklyFocus(): WeeklyFocus[] {
  return [1, 2, 3, 4, 5].map((weekNumber) => ({
    weekNumber,
    text: '',
  }));
}

export function getWeeksInMonth(year: number, month: number): number {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstDayOfWeek = firstDay.getDay();
  const totalDays = lastDay.getDate();
  return Math.ceil((totalDays + firstDayOfWeek) / 7);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  return new Date(year, month - 1, 1).getDay();
}
