import { PlanCategory } from '@/types/mandalart';
import { BasePlanData } from '@/lib/templateRegistry';

/**
 * 전체 플랜 목록(사이드바 최근 목록 + 플랜 보관함)의 조회 규칙.
 * 모두 새 배열을 돌려주며 원본 플랜 객체(날짜·내용·updatedAt)는 건드리지 않는다.
 */

/** 사이드바 카테고리별로 바로 보여주는 최근 플랜 수 */
export const RECENT_PLAN_LIMIT = 5;

export const UNTITLED_PLAN_LABEL = '제목 없음';

export type PlanSortOrder = 'created' | 'updated' | 'title';

export const PLAN_SORT_LABELS: Record<PlanSortOrder, string> = {
  created: '최근 만든 순',
  updated: '최근 수정 순',
  title: '제목 순',
};

export type PlanCategoryFilter = PlanCategory | 'all';

/**
 * 템플릿마다 store가 달라 id만으로는 항목을 구별할 수 없다. 목록 key·선택 비교는 이 값으로 한다.
 */
export function planKey(plan: Pick<BasePlanData, 'template' | 'id'>): string {
  return `${plan.template}:${plan.id}`;
}

export function planDisplayTitle(plan: Pick<BasePlanData, 'title'>): string {
  return plan.title || UNTITLED_PLAN_LABEL;
}

function timeOf(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

const titleCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** 정렬 기준이 같으면 key로 순서를 고정해 목록이 렌더링마다 흔들리지 않게 한다. */
export function sortPlans(plans: readonly BasePlanData[], order: PlanSortOrder = 'created'): BasePlanData[] {
  const compare = (a: BasePlanData, b: BasePlanData): number => {
    switch (order) {
      case 'created':
        return timeOf(b.createdAt) - timeOf(a.createdAt);
      case 'updated':
        return timeOf(b.updatedAt) - timeOf(a.updatedAt);
      case 'title':
        return titleCollator.compare(planDisplayTitle(a), planDisplayTitle(b));
    }
  };
  return plans.slice().sort((a, b) => compare(a, b) || planKey(a).localeCompare(planKey(b)));
}

export function recentPlans(plans: readonly BasePlanData[]): BasePlanData[] {
  return sortPlans(plans, 'created').slice(0, RECENT_PLAN_LIMIT);
}

function normalizeForSearch(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
}

/** 화면에 보이는 제목 기준 부분 일치. 빈 검색어는 전체를 돌려준다. */
export function filterPlans(
  plans: readonly BasePlanData[],
  { query = '', category = 'all' }: { query?: string; category?: PlanCategoryFilter },
): BasePlanData[] {
  const needle = normalizeForSearch(query);
  return plans.filter(
    (plan) =>
      (category === 'all' || plan.category === category) &&
      (!needle || normalizeForSearch(planDisplayTitle(plan)).includes(needle)),
  );
}
