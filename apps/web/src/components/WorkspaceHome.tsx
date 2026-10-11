'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BasePlanData, selectExclusive, templateRegistry } from '@/lib/templateRegistry';
import { planDisplayTitle, planKey, RECENT_PLAN_LIMIT, sortPlans } from '@/lib/planLibrary';
import { createPlanWithDefaults } from '@/lib/planCreation';
import { FOCUS_RING } from '@/lib/constants';
import { PlanUrlNotice } from '@/hooks/usePlanSelectionUrl';
import { planDateLabel } from './PlanLibrary';

const NOTICE_MESSAGES: Record<PlanUrlNotice, string> = {
  malformed: '주소의 플랜 정보가 올바르지 않아요. 아래에서 플랜을 선택해 주세요.',
  unavailable: '주소의 플랜을 열 수 없어요. 삭제되었거나 이 계정의 플랜이 아닐 수 있어요.',
};

const ITEM_CLASS = `w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-slate-300 hover:bg-slate-50 transition-colors ${FOCUS_RING}`;

/** 자정 타이머가 몇 ms 일찍 깨어나 어제 날짜를 다시 읽지 않도록 두는 여유 */
const MIDNIGHT_REFRESH_MARGIN_MS = 1_000;

interface LocalDay { year: number; month: number; day: number }

function todayPeriod(): LocalDay {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

const sameDay = (a: LocalDay, b: LocalDay) => a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * 브라우저 현지 '오늘'. 탭이 다시 보이거나 창이 초점을 받을 때(잠든 노트북 포함)와 현지 자정에 다시 읽는다.
 * 하루 한 번 깨어나는 타이머만 쓰고 폴링하지 않는다. refresh는 읽은 날짜를 바로 돌려준다.
 */
function useLocalToday(): [LocalDay, () => LocalDay] {
  const [today, setToday] = useState(todayPeriod);
  const refresh = useCallback(() => {
    const next = todayPeriod();
    setToday((previous) => (sameDay(previous, next) ? previous : next));
    return next;
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => { refresh(); arm(); }, midnight.getTime() - now.getTime() + MIDNIGHT_REFRESH_MARGIN_MS);
    };
    // 잠든 동안 멈춘 타이머는 늦게 깨어날 수 있어 다시 보일 때 새로 맞춘다.
    const onActive = () => {
      if (document.visibilityState !== 'visible') return;
      refresh();
      arm();
    };
    arm();
    document.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
    };
  }, [refresh]);

  return [today, refresh];
}

/** 오늘 날짜의 일간 투두리스트. 같은 날 플랜이 여럿이면 모두 보여 주고 고르게 한다(병합·덮어쓰기 없음). */
function todayDailyPlans(plans: readonly BasePlanData[], today: LocalDay): BasePlanData[] {
  return sortPlans(plans.filter((plan) => plan.template === 'daily' && plan.category === 'daily'
    && plan.year === today.year && plan.month === today.month && plan.day === today.day), 'created');
}

function PlanItem({ plan, onOpen, label }: { plan: BasePlanData; onOpen: (plan: BasePlanData) => void; label?: string }) {
  const entry = templateRegistry[plan.template];
  return (
    <li>
      <button type="button" onClick={() => onOpen(plan)} className={ITEM_CLASS}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-700">{label ?? planDisplayTitle(plan)}</span>
          <span className="block text-xs text-slate-400">{planDateLabel(plan)}</span>
        </span>
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${entry.badgeColor}`}>{entry.label}</span>
      </button>
    </li>
  );
}

interface WorkspaceHomeProps {
  plans: BasePlanData[];
  notice: PlanUrlNotice | null;
}

/**
 * 선택한 플랜이 없을 때의 작업 공간. 불러오기·이동만으로는 아무것도 만들지 않고, 모든 생성은 버튼으로만 한다.
 * 최근 작업은 기존 메타데이터(updatedAt)로 정렬하고 같으면 template:id로 순서를 고정한다.
 */
export function WorkspaceHome({ plans, notice }: WorkspaceHomeProps) {
  const [today, refreshToday] = useLocalToday();
  const todays = todayDailyPlans(plans, today);
  const recent = sortPlans(plans, 'updated').slice(0, RECENT_PLAN_LIMIT);
  // 빠른 연속 클릭에도 오늘 플랜을 한 번만 만든다. 생성되면 선택되어 이 화면은 사라진다.
  const creatingRef = useRef(false);

  const open = (plan: BasePlanData) => selectExclusive(plan.template, plan.id);
  const createToday = () => {
    if (creatingRef.current) return;
    // 그린 뒤 날짜(자정·잠든 탭)나 store가 바뀌었을 수 있어 누르는 순간 다시 확인한다. 어제 날짜·중복 생성 방지.
    const now = refreshToday();
    const existing = todayDailyPlans(templateRegistry.daily.getPlans(), now);
    if (existing.length === 1) return open(existing[0]);
    if (existing.length > 1) return; // 새 날짜의 목록이 다시 그려진다
    creatingRef.current = true;
    createPlanWithDefaults('daily', 'daily', now);
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-6 md:py-10 space-y-8">
      {notice && (
        <p role="status" data-testid="plan-url-notice" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {NOTICE_MESSAGES[notice]}
        </p>
      )}

      <section aria-labelledby="workspace-today">
        <h2 id="workspace-today" className="text-base font-semibold text-slate-700">오늘 할 일</h2>
        <p className="mt-1 text-xs text-slate-400">
          {today.year}년 {today.month}월 {today.day}일 · 일간 투두리스트
        </p>
        <div className="mt-3">
          {todays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center">
              <p className="text-sm text-slate-500">오늘의 일간 플랜이 아직 없어요</p>
              <button
                type="button"
                onClick={createToday}
                className={`mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors ${FOCUS_RING}`}
              >
                오늘 플랜 만들기
              </button>
            </div>
          ) : (
            <>
              {todays.length > 1 && (
                <p className="mb-2 text-xs text-slate-500">오늘 날짜의 일간 플랜이 {todays.length}개 있어요. 열 플랜을 고르세요.</p>
              )}
              <ul aria-label="오늘 플랜" className="space-y-2">
                {todays.map((plan) => (
                  <PlanItem key={planKey(plan)} plan={plan} onOpen={open} label={todays.length === 1 ? `오늘 플랜 열기 · ${planDisplayTitle(plan)}` : undefined} />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="workspace-recent">
        <h2 id="workspace-recent" className="text-base font-semibold text-slate-700">최근 작업</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">아직 만든 플랜이 없어요</p>
        ) : (
          <ul aria-label="최근 작업" className="mt-3 space-y-2">
            {recent.map((plan) => <PlanItem key={planKey(plan)} plan={plan} onOpen={open} />)}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">새 플랜은 사이드바의 카테고리별 + 버튼으로 만들 수 있어요</p>
      </section>
    </div>
  );
}
