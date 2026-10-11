'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PlanCategory, PLAN_CATEGORY_LABELS, TemplateType } from '@/types/mandalart';
import { BasePlanData, templateRegistry } from '@/lib/templateRegistry';
import {
  filterPlans,
  planDisplayTitle,
  planKey,
  PlanCategoryFilter,
  PlanSortOrder,
  PLAN_SORT_LABELS,
  sortPlans,
} from '@/lib/planLibrary';
import { formatPlanDate } from '@/components/DatePicker';
import { trapTabKey } from '@/hooks/useModalDialog';

export const PLAN_CATEGORIES: PlanCategory[] = ['annual', 'monthly', 'weekly', 'daily'];

const CATEGORY_FILTERS: PlanCategoryFilter[] = ['all', ...PLAN_CATEGORIES];
const ALL_CATEGORY_LABEL = '전체';

export function planDateLabel(plan: BasePlanData): string {
  return plan.template === 'monthly'
    ? formatPlanDate('monthly', plan.year, plan.month, undefined, undefined, true)
    : formatPlanDate(plan.category, plan.year, plan.month, plan.week, plan.day, true);
}

interface PlanLibraryProps {
  plans: BasePlanData[];
  initialCategory?: PlanCategoryFilter;
  currentId: string | null;
  currentTemplate: TemplateType | null;
  onSelect: (id: string, template: TemplateType) => void;
  onDuplicate: (id: string, template: TemplateType) => void;
  onDelete: (id: string, template: TemplateType) => void;
  onClose: () => void;
  /** 복제 날짜 선택·삭제 확인처럼 위에 다른 모달이 떠 있는 동안 true. 초점 가두기를 멈추고 조작을 막는다. */
  suspended?: boolean;
}

/**
 * 저장된 모든 플랜을 카테고리·제목으로 찾아 여는 보관함.
 * 조회 전용이다. 선택·복제·삭제는 사이드바와 같은 핸들러를 거친다.
 */
export function PlanLibrary({
  plans,
  initialCategory = 'all',
  currentId,
  currentTemplate,
  onSelect,
  onDuplicate,
  onDelete,
  onClose,
  suspended = false,
}: PlanLibraryProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlanCategoryFilter>(initialCategory);
  const [sortOrder, setSortOrder] = useState<PlanSortOrder>('created');
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const countId = useId();

  const categoryCounts = useMemo(() => {
    const counts: Record<PlanCategoryFilter, number> = { all: plans.length, annual: 0, monthly: 0, weekly: 0, daily: 0 };
    for (const plan of plans) counts[plan.category] += 1;
    return counts;
  }, [plans]);

  const results = useMemo(
    () => sortPlans(filterPlans(plans, { query, category }), sortOrder),
    [plans, query, category, sortOrder],
  );

  // 열릴 때 검색창에 초점을 두고, 닫히면 연 버튼으로 초점을 돌려준다.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // 위에 뜬 모달이 닫히면 그 모달을 연 항목(없어졌으면 검색창)으로 초점을 되돌린다.
  // inert가 적용되면 초점이 풀리므로 activeElement 대신 마지막으로 초점을 받은 요소를 기억한다.
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const wasSuspendedRef = useRef(suspended);
  useEffect(() => {
    const resumed = wasSuspendedRef.current && !suspended;
    wasSuspendedRef.current = suspended;
    if (!resumed) return;
    const target = lastFocusedRef.current;
    if (target?.isConnected && dialogRef.current?.contains(target)) target.focus();
    else searchRef.current?.focus();
  }, [suspended]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (suspended) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    // 모달 밖으로 초점이 빠지지 않게 순환시킨다.
    if (dialogRef.current) trapTabKey(e, dialogRef.current);
  };

  const trimmedQuery = query.trim();
  const countLabel = trimmedQuery ? `검색 결과 ${results.length}개` : `${results.length}개 플랜`;

  return (
    <div
      className="fixed inset-0 overlay-safe z-50 flex items-stretch justify-center bg-black/20 md:items-center"
      onClick={suspended ? undefined : onClose}
      inert={suspended}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          if (e.target instanceof HTMLElement) lastFocusedRef.current = e.target;
        }}
        onClick={(e) => e.stopPropagation()}
        className="
          flex w-full flex-col bg-white
          md:mx-4 md:max-h-[min(80vh,100%)] md:max-w-lg md:rounded-2xl md:shadow-2xl
        "
      >
        <div className="border-b border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold text-slate-800">
              전체 플랜
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="전체 플랜 닫기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목으로 검색"
            aria-label="플랜 제목 검색"
            aria-describedby={countId}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />

          <div role="group" aria-label="카테고리" className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((filter) => {
              const active = filter === category;
              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(filter)}
                  className={`
                    rounded-full px-2.5 py-1 text-xs transition-colors
                    ${active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                  `}
                >
                  {filter === 'all' ? ALL_CATEGORY_LABEL : PLAN_CATEGORY_LABELS[filter]} {categoryCounts[filter]}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p id={countId} className="text-xs text-slate-500" aria-live="polite">
              {countLabel}
            </p>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <span className="sr-only">정렬</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as PlanSortOrder)}
                className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600"
              >
                {(Object.keys(PLAN_SORT_LABELS) as PlanSortOrder[]).map((order) => (
                  <option key={order} value={order}>
                    {PLAN_SORT_LABELS[order]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-slate-400">
              {plans.length === 0
                ? '저장된 플랜이 없습니다'
                : trimmedQuery
                  ? `'${trimmedQuery}'와 일치하는 플랜이 없습니다`
                  : '이 카테고리에 플랜이 없습니다'}
            </p>
          ) : (
            <ul aria-label="플랜 목록" className="space-y-1">
              {results.map((plan) => {
                const entry = templateRegistry[plan.template];
                const title = planDisplayTitle(plan);
                const isSelected = currentId === plan.id && currentTemplate === plan.template;
                const dateLabel = planDateLabel(plan);
                return (
                  <li
                    key={planKey(plan)}
                    data-plan-key={planKey(plan)}
                    className={`flex items-center gap-1 rounded-lg ${isSelected ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(plan.id, plan.template)}
                      aria-current={isSelected ? 'true' : undefined}
                      className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-slate-700">{title}</span>
                        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-xs ${entry.badgeColor}`}>
                          {entry.label}
                        </span>
                      </span>
                      <span className="text-xs text-slate-400">
                        {PLAN_CATEGORY_LABELS[plan.category]}
                        {dateLabel && ` · ${dateLabel}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicate(plan.id, plan.template)}
                      aria-label={`${title} 복제`}
                      title="복제"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(plan.id, plan.template)}
                      aria-label={`${title} 삭제`}
                      title="삭제"
                      className="mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
