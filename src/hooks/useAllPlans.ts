'use client';

import { useMandalartStore, useHydration } from '@/hooks/useMandalart';
import { useBlock6Store, useBlock6Hydration } from '@/hooks/useBlock6';
import { useMonthlyStore, useMonthlyHydration } from '@/hooks/useMonthly';
import { useDailyStore, useDailyHydration } from '@/hooks/useDaily';
import { useHolidayHydration } from '@/hooks/useHolidays';
import { TemplateType, PlanCategory } from '@/types/mandalart';
import { BasePlanData } from '@/lib/templateRegistry';

/**
 * 모든 store의 plans + currentId를 반응형으로 구독.
 * 새 템플릿 추가 시 여기만 수정.
 */
export function useAllPlansReactive() {
  const mandalarts = useMandalartStore((s) => s.mandalarts);
  const block6Plans = useBlock6Store((s) => s.block6Plans);
  const monthlyPlans = useMonthlyStore((s) => s.monthlyPlans);
  const dailyPlans = useDailyStore((s) => s.dailyPlans);

  const currentMandalartId = useMandalartStore((s) => s.currentId);
  const currentBlock6Id = useBlock6Store((s) => s.currentBlock6Id);
  const currentMonthlyId = useMonthlyStore((s) => s.currentMonthlyId);
  const currentDailyId = useDailyStore((s) => s.currentDailyId);

  const allPlans: BasePlanData[] = [
    ...(mandalarts as BasePlanData[]),
    ...(block6Plans as BasePlanData[]),
    ...(monthlyPlans as BasePlanData[]),
    ...(dailyPlans as BasePlanData[]),
  ];

  const currentTemplate: TemplateType | null =
    currentMandalartId ? 'mandalart'
    : currentBlock6Id ? 'block6'
    : currentMonthlyId ? 'monthly'
    : currentDailyId ? 'daily'
    : null;

  const currentId = currentMandalartId || currentBlock6Id || currentMonthlyId || currentDailyId;

  const getPlansByCategory = (category: PlanCategory): BasePlanData[] =>
    allPlans.filter((p) => p.category === category);

  return { allPlans, currentTemplate, currentId, getPlansByCategory };
}

/**
 * 모든 store의 hydration 상태 집계.
 * ESLint hooks 규칙 준수를 위해 명시적 호출.
 */
export function useAllHydrated(): boolean {
  const h1 = useHydration();
  const h2 = useBlock6Hydration();
  const h3 = useMonthlyHydration();
  const h4 = useDailyHydration();
  const h5 = useHolidayHydration();
  return h1 && h2 && h3 && h4 && h5;
}
