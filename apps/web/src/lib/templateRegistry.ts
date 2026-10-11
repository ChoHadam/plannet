'use client';

import { ComponentType, createElement } from 'react';
import type { LazyComponent } from '@/lib/lazyComponent';
import { MandalartData, TemplateType, PlanCategory } from '@/types/mandalart';
import { Block6Data } from '@/types/block6';
import { MonthlyData } from '@/types/monthly';
import { DailyData } from '@/types/daily';
import { generateId } from '@/lib/sanitize';
import { useMandalartStore, useHydration } from '@/hooks/useMandalart';
import { useBlock6Store, useBlock6Hydration } from '@/hooks/useBlock6';
import { useMonthlyStore, useMonthlyHydration } from '@/hooks/useMonthly';
import { useDailyStore, useDailyHydration } from '@/hooks/useDaily';
import { lazyComponent } from '@/lib/lazyComponent';
import { TemplateLoading } from '@/components/TemplateLoading';
import { LazyLoadDialog } from '@/components/LazyLoadDialog';

// 편집기·사용법은 템플릿별로 처음 열 때 받는다(작업 공간 첫 로딩에 4개 편집기를 모두 싣지 않는다).
// 사용법은 받는 동안·실패 시 닫기·다시 시도가 있는 대화상자를 먼저 띄우고, 코드가 도착하면 사용법으로 바뀐다.
type GridProps = object;
type GuideProps = { onStart: () => void; onClose: () => void; startLabel?: string };
const gridLoading = createElement(TemplateLoading);
const gridFailed = (_: GridProps, retry: () => void) => createElement(TemplateLoading, { onRetry: retry });
const guideLoading = ({ onClose }: GuideProps) => createElement(LazyLoadDialog, { title: '사용법', onClose });
const guideFailed = ({ onClose }: GuideProps, retry: () => void) => createElement(LazyLoadDialog, { title: '사용법', onClose, onRetry: retry });
const lazyGrid = (load: () => Promise<ComponentType<GridProps>>) => lazyComponent(load, gridLoading, gridFailed);
const lazyGuide = (load: () => Promise<ComponentType<GuideProps>>) => lazyComponent(load, guideLoading, guideFailed);
const MandalartGrid = lazyGrid(() => import('@/components/Mandalart/MandalartGrid').then((m) => m.MandalartGrid));
const MandalartGuide = lazyGuide(() => import('@/components/MandalartGuide').then((m) => m.MandalartGuide));
const Block6Grid = lazyGrid(() => import('@/components/Block6/Block6Grid').then((m) => m.Block6Grid));
const Block6Guide = lazyGuide(() => import('@/components/Block6/Block6Guide').then((m) => m.Block6Guide));
const MonthlyGrid = lazyGrid(() => import('@/components/Monthly/MonthlyGrid').then((m) => m.MonthlyGrid));
const MonthlyGuide = lazyGuide(() => import('@/components/Monthly/MonthlyGuide').then((m) => m.MonthlyGuide));
const DailyGrid = lazyGrid(() => import('@/components/Daily/DailyGrid').then((m) => m.DailyGrid));
const DailyGuide = lazyGuide(() => import('@/components/Daily/DailyGuide').then((m) => m.DailyGuide));

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
  addPlanAndSelect: (plan: BasePlanData) => void; // store에 플랜 추가 + 선택
  create: (category: PlanCategory, date: DateParams) => void;
  applyTitleAndDate: (title: string, date: DateParams) => void;

  // React hook 기반 (컴포넌트 렌더링에서 사용)
  useCurrentPlan: () => BasePlanData | null;
  useUpdateTitle: () => (title: string) => void;
  useUpdatePlanDate: () => (year?: number, month?: number, week?: number, day?: number) => void;
  useHydration: () => boolean;

  // 컴포넌트
  /** startLabel: 생성 전 안내는 기본 '시작하기', 헤더 사용법처럼 읽기만 할 때는 닫는 문구 */
  GuideComponent: ComponentType<GuideProps>;
  GridComponent: LazyComponent<GridProps>;
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
    addPlanAndSelect: (plan) => {
      const state = useMandalartStore.getState();
      useMandalartStore.setState({ mandalarts: [plan as MandalartData, ...state.mandalarts], currentId: plan.id });
    },
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
    addPlanAndSelect: (plan) => {
      const state = useBlock6Store.getState();
      useBlock6Store.setState({ block6Plans: [plan as Block6Data, ...state.block6Plans], currentBlock6Id: plan.id });
    },
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
    clearSelection: () => useMonthlyStore.getState().selectMonthlyPlan(null),
    select: (id) => useMonthlyStore.getState().selectMonthlyPlan(id),
    deletePlan: (id) => useMonthlyStore.getState().deleteMonthlyPlan(id),
    addPlanAndSelect: (plan) => {
      const state = useMonthlyStore.getState();
      useMonthlyStore.setState({ monthlyPlans: [plan as MonthlyData, ...state.monthlyPlans], currentMonthlyId: plan.id, viewedMonth: null });
    },
    create: (category, date) => useMonthlyStore.getState().createMonthlyPlan(category, date.year, date.month),
    applyTitleAndDate: (title, date) => {
      const state = useMonthlyStore.getState();
      state.updateTitle(title);
      state.updatePlanDate(date.year, date.month);
    },

    GuideComponent: MonthlyGuide,
    GridComponent: MonthlyGrid,

    useCurrentPlan: () => useMonthlyStore((state) =>
      state.currentMonthlyId ? (state.monthlyPlans.find(p => p.id === state.currentMonthlyId) as BasePlanData | undefined) ?? null : null
    ),
    useUpdateTitle: () => useMonthlyStore((s) => s.updateTitle),
    useUpdatePlanDate: () => useMonthlyStore((s) => s.updatePlanDate),
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
    clearSelection: () => useDailyStore.getState().selectDailyPlan(null),
    select: (id) => useDailyStore.getState().selectDailyPlan(id),
    deletePlan: (id) => useDailyStore.getState().deleteDailyPlan(id),
    addPlanAndSelect: (plan) => {
      const state = useDailyStore.getState();
      useDailyStore.setState({ dailyPlans: [plan as DailyData, ...state.dailyPlans], currentDailyId: plan.id, viewedDay: null });
    },
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

/** 플랜 복제 — 템플릿 종류 무관하게 동작. date로 날짜 오버라이드 가능 */
export function duplicatePlan(
  id: string,
  template: TemplateType,
  date?: DateParams
): string | null {
  const entry = templateRegistry[template];
  const plan = entry.getPlans().find(p => p.id === id);
  if (!plan) return null;

  const newId = generateId();
  const now = new Date().toISOString();
  const newPlan: BasePlanData = JSON.parse(JSON.stringify({
    ...plan,
    id: newId,
    title: `${plan.title || '제목 없음'} (복사)`,
    createdAt: now,
    updatedAt: now,
    ...(date?.year !== undefined && { year: date.year }),
    ...(date?.month !== undefined && { month: date.month }),
    ...(date?.week !== undefined && { week: date.week }),
    ...(date?.day !== undefined && { day: date.day }),
  }));

  entry.addPlanAndSelect(newPlan);
  return newId;
}
