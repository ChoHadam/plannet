'use client';

import { useLayoutEffect, useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { clearAllSelections, selectExclusive, templateRegistry, TEMPLATE_TYPES } from '@/lib/templateRegistry';
import { getPlannerStorageScope } from '@/lib/plannerStorage';
import { parsePlanSelection, PlanSelection, planSelectionHref, sameSelection } from '@/lib/planSelectionUrl';

/** 주소의 플랜을 열 수 없을 때 빈 작업 공간에 보여줄 안내 종류 */
export type PlanUrlNotice = 'malformed' | 'unavailable';

const TEMPLATE_STORES = [useMandalartStore, useBlock6Store, useMonthlyStore, useDailyStore];

/** useAllPlansReactive와 같은 우선순위로 현재 선택을 읽는다 */
function currentSelection(): PlanSelection | null {
  for (const template of TEMPLATE_TYPES) {
    const id = templateRegistry[template].getCurrentId();
    if (id) return { template, id };
  }
  return null;
}

function planExists({ template, id }: PlanSelection): boolean {
  return templateRegistry[template].getPlans().some((plan) => plan.id === id);
}

/** Next.js가 감싼 history API를 쓴다. state는 null로 넘겨 라우터 내부 상태를 이어받게 한다. */
function writeUrl(selection: PlanSelection | null, mode: 'push' | 'replace'): void {
  const href = planSelectionHref(window.location, selection);
  if (href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  if (mode === 'push') window.history.pushState(null, '', href);
  else window.history.replaceState(null, '', href);
}

/**
 * 플랜 선택 ↔ 주소창 동기화. 플랜 본문은 브라우저 저장소에 두지 않고 주소에는 템플릿+ID만 둔다.
 * ready(복원·첫 DB 조회 완료)이고 저장 범위가 현재 계정과 같을 때만 동작한다. 그 전에는 주소를 읽지도 고치지도 않는다.
 * 선택 변경은 store의 currentId만 바꾸므로 저장 요청·버전 증가·삭제를 만들지 않는다.
 * 주소의 플랜이 이 계정의 불러온 목록에 없으면(없는 ID·삭제·다른 계정) 다른 곳에 조회하지 않고 선택을 비운 채 안내한다.
 */
export function usePlanSelectionUrl(ready: boolean, storageScope: string | null) {
  const [notice, setNotice] = useState<PlanUrlNotice | null>(null);

  // 첫 화면에 빈 작업 공간이 잠깐 보이지 않도록 그리기 전에 주소의 선택을 반영한다.
  useLayoutEffect(() => {
    if (!ready || !storageScope || getPlannerStorageScope() !== storageScope) return;

    /** 주소 → 선택. initial이고 주소에 선택이 없으면 기존 선택(인증을 끈 로컬 모드의 복원값)을 유지한다. */
    const applyFromUrl = (initial: boolean) => {
      const parsed = parsePlanSelection(window.location.search);
      if (parsed.kind === 'none') {
        if (!initial) clearAllSelections();
        setNotice(null);
        return;
      }
      if (parsed.kind === 'plan' && planExists(parsed.selection)) {
        if (!sameSelection(currentSelection(), parsed.selection)) selectExclusive(parsed.selection.template, parsed.selection.id);
        setNotice(null);
        return;
      }
      clearAllSelections();
      setNotice(parsed.kind === 'malformed' ? 'malformed' : 'unavailable');
      writeUrl(null, 'replace');
    };

    applyFromUrl(true);
    let last = currentSelection();
    writeUrl(last, 'replace');

    // 선택 → 주소. 다른 플랜으로 옮기면 기록을 쌓고, 보던 플랜이 삭제되어 바뀐 경우는 현재 기록을 바꾼다(뒤로 가기가 삭제된 플랜을 가리키지 않게).
    // selectExclusive는 다른 store를 먼저 비우므로 중간의 '선택 없음'이 기록되지 않게 한 작업이 끝난 뒤 한 번만 반영한다.
    let scheduled = false;
    let active = true;
    const syncUrl = () => {
      scheduled = false;
      if (!active) return;
      const next = currentSelection();
      if (sameSelection(next, last)) return;
      const previousGone = !!last && !planExists(last);
      last = next;
      if (next) setNotice(null);
      writeUrl(next, previousGone ? 'replace' : 'push');
    };
    const onStoreChange = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(syncUrl);
    };
    const unsubscribe = TEMPLATE_STORES.map((store) => store.subscribe(onStoreChange));

    const onPopState = () => {
      applyFromUrl(false);
      last = currentSelection();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      active = false;
      unsubscribe.forEach((stop) => stop());
      window.removeEventListener('popstate', onPopState);
    };
  }, [ready, storageScope]);

  return { notice };
}
