'use client';

import { ComponentType } from 'react';
import { TemplateType, PlanCategory } from '@/types/mandalart';
import { useMandalartStore, useHydration } from '@/hooks/useMandalart';
import { useBlock6Store, useBlock6Hydration } from '@/hooks/useBlock6';
import { useMonthlyStore, useMonthlyHydration } from '@/hooks/useMonthly';
import { useDailyStore, useDailyHydration } from '@/hooks/useDaily';
import { MandalartGrid } from '@/components/Mandalart';
import { MandalartGuide } from '@/components/MandalartGuide';
import { Block6Grid, Block6Guide } from '@/components/Block6';
import { MonthlyGrid, MonthlyGuide } from '@/components/Monthly';
import { DailyGrid, DailyGuide } from '@/components/Daily';

// ---- 모든 플랜 타입의 공통 필드 ----
export interface BasePlanData {
  id: string;
  title: string;
  category: PlanCategory;
  template: TemplateType;
  createdAt: string;
  updatedAt: string;
  year?: number;
  month?: number;
  week?: number;
  day?: number;
}

// ---- 레지스트리 엔트리 ----
export interface TemplateEntry {
  type: TemplateType;
  label: string;
  placeholder: string;
  description: string;
  badgeColor: string;
  footerHint: string;
  allowedCategories: PlanCategory[]; // 이 템플릿을 선택할 수 있는 카테고리
  defaultForCategory?: PlanCategory; // 이 카테고리의 추천 템플릿

  // Store 접근 (non-hook, getState 기반 — 이벤트 핸들러에서 사용)
  getPlans: () => BasePlanData[];
  getCurrentId: () => string | null;
  clearSelection: () => void;
  select: (id: string) => void;
  deletePlan: (id: string) => void;
  create: (category: PlanCategory, date: DateParams) => void;
  applyTitleAndDate: (title: string, date: DateParams) => void;

  // React hook 기반 (컴포넌트 렌더링에서 사용)
  useCurrentPlan: () => BasePlanData | null;
  useUpdateTitle: () => (title: string) => void;
  useUpdatePlanDate: () => (year?: number, month?: number, week?: number, day?: number) => void;
  useHydration: () => boolean;

  // 컴포넌트
  GuideComponent: ComponentType<{ onStart: () => void; onClose: () => void }>;
  GridComponent: ComponentType;
}

interface DateParams {
  year?: number;
  month?: number;
  week?: number;
  day?: number;
}

// ---- 레지스트리 정의 ----
export const templateRegistry: Record<TemplateType, TemplateEntry> = {
  mandalart: {
    type: 'mandalart',
    label: '만다라트',
    placeholder: '나의 만다라트',
    description: '9x9 그리드로 목표를 세분화',
    badgeColor: 'bg-amber-100 text-amber-600',
    footerHint: '구역을 클릭하여 색상을 변경할 수 있습니다',
    allowedCategories: ['annual', 'monthly', 'weekly', 'daily'],
    defaultForCategory: 'annual',

    getPlans: () => useMandalartStore.getState().mandalarts as BasePlanData[],
    getCurrentId: () => useMandalartStore.getState().currentId,
    clearSelection: () => useMandalartStore.setState({ currentId: null }),
    select: (id) => useMandalartStore.getState().selectMandalart(id),
    deletePlan: (id) => useMandalartStore.getState().deleteMandalart(id),
    create: (category) => useMandalartStore.getState().createMandalart(category),
    applyTitleAndDate: (title, date) => {
      const s = useMandalartStore.getState();
      s.updateTitle(title);
      if (date.year !== undefined) s.updatePlanDate(date.year, date.month, date.week, date.day);
    },

    GuideComponent: MandalartGuide,
    GridComponent: MandalartGrid,

    useCurrentPlan: () => useMandalartStore((state) =>
      state.currentId ? (state.mandalarts.find(m => m.id === state.currentId) as BasePlanData | undefined) ?? null : null
    ),
    useUpdateTitle: () => useMandalartStore((s) => s.updateTitle),
    useUpdatePlanDate: () => useMandalartStore((s) => s.updatePlanDate),
    useHydration,
  },

  block6: {
    type: 'block6',
    label: 'Block 6',
    placeholder: '나의 Block 6',
    description: '하루 6블록 시간 관리',
    badgeColor: 'bg-violet-100 text-violet-600',
    footerHint: '각 블록에 키워드와 할 일을 입력하세요',
    allowedCategories: ['weekly'],
    defaultForCategory: 'weekly',

    getPlans: () => useBlock6Store.getState().block6Plans as BasePlanData[],
    getCurrentId: () => useBlock6Store.getState().currentBlock6Id,
    clearSelection: () => useBlock6Store.setState({ currentBlock6Id: null }),
    select: (id) => useBlock6Store.getState().selectBlock6Plan(id),
    deletePlan: (id) => useBlock6Store.getState().deleteBlock6Plan(id),
    create: (category) => useBlock6Store.getState().createBlock6Plan(category),
    applyTitleAndDate: (title, date) => {
      const s = useBlock6Store.getState();
      s.updateTitle(title);
      if (date.year !== undefined) s.updatePlanDate(date.year, date.month, date.week, date.day);
    },

    GuideComponent: Block6Guide,
    GridComponent: Block6Grid,

    useCurrentPlan: () => useBlock6Store((state) =>
      state.currentBlock6Id ? (state.block6Plans.find(p => p.id === state.currentBlock6Id) as BasePlanData | undefined) ?? null : null
    ),
    useUpdateTitle: () => useBlock6Store((s) => s.updateTitle),
    useUpdatePlanDate: () => useBlock6Store((s) => s.updatePlanDate),
    useHydration: useBlock6Hydration,
  },

  monthly: {
    type: 'monthly',
    label: '월간 플래너',
    placeholder: '나의 월간 플래너',
    description: '월간 목표와 주간 계획',
    badgeColor: 'bg-blue-100 text-blue-600',
    footerHint: '이달의 목표를 설정하고 주간 포커스를 작성하세요',
    allowedCategories: ['monthly'],
    defaultForCategory: 'monthly',

    getPlans: () => useMonthlyStore.getState().monthlyPlans as BasePlanData[],
    getCurrentId: () => useMonthlyStore.getState().currentMonthlyId,
    clearSelection: () => useMonthlyStore.setState({ currentMonthlyId: null }),
    select: (id) => useMonthlyStore.getState().selectMonthlyPlan(id),
    deletePlan: (id) => useMonthlyStore.getState().deleteMonthlyPlan(id),
    create: (category, date) => useMonthlyStore.getState().createMonthlyPlan(category, date.year, date.month),
    applyTitleAndDate: (title) => useMonthlyStore.getState().updateTitle(title),

    GuideComponent: MonthlyGuide,
    GridComponent: MonthlyGrid,

    useCurrentPlan: () => useMonthlyStore((state) =>
      state.currentMonthlyId ? (state.monthlyPlans.find(p => p.id === state.currentMonthlyId) as BasePlanData | undefined) ?? null : null
    ),
    useUpdateTitle: () => useMonthlyStore((s) => s.updateTitle),
    useUpdatePlanDate: () => () => {}, // Monthly has no updatePlanDate
    useHydration: useMonthlyHydration,
  },

  daily: {
    type: 'daily',
    label: '투두리스트',
    placeholder: '나의 투두리스트',
    description: '간단한 일간 할 일 관리',
    badgeColor: 'bg-emerald-100 text-emerald-600',
    footerHint: '할 일을 추가하고 완료하면 체크하세요',
    allowedCategories: ['annual', 'monthly', 'weekly', 'daily'],
    defaultForCategory: 'daily',

    getPlans: () => useDailyStore.getState().dailyPlans as BasePlanData[],
    getCurrentId: () => useDailyStore.getState().currentDailyId,
    clearSelection: () => useDailyStore.setState({ currentDailyId: null }),
    select: (id) => useDailyStore.getState().selectDailyPlan(id),
    deletePlan: (id) => useDailyStore.getState().deleteDailyPlan(id),
    create: (category, date) => useDailyStore.getState().createDailyPlan(category, date.year, date.month, date.day),
    applyTitleAndDate: (title) => useDailyStore.getState().updateTitle(title),

    GuideComponent: DailyGuide,
    GridComponent: DailyGrid,

    useCurrentPlan: () => useDailyStore((state) =>
      state.currentDailyId ? (state.dailyPlans.find(p => p.id === state.currentDailyId) as BasePlanData | undefined) ?? null : null
    ),
    useUpdateTitle: () => useDailyStore((s) => s.updateTitle),
    useUpdatePlanDate: () => {
      const fn = useDailyStore((s) => s.updatePlanDate);
      return (year?: number, month?: number, _week?: number, day?: number) => fn(year, month, day);
    },
    useHydration: useDailyHydration,
  },
};

// ---- 유틸 함수 ----

export const TEMPLATE_TYPES = Object.keys(templateRegistry) as TemplateType[];

export function selectExclusive(template: TemplateType, id: string): void {
  for (const entry of Object.values(templateRegistry)) {
    if (entry.type !== template) entry.clearSelection();
  }
  templateRegistry[template].select(id);
}

export function clearAllSelections(): void {
  for (const entry of Object.values(templateRegistry)) {
    entry.clearSelection();
  }
}

export function getAllTitles(): string[] {
  return TEMPLATE_TYPES.flatMap(t => templateRegistry[t].getPlans().map(p => p.title));
}
