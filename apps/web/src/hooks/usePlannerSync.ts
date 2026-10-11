'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { INITIAL_SYNC_STATUS, PlannerSync, SyncStatus } from '@/lib/plannerSync';
import { plannerSyncApi } from '@/lib/plannerSyncApi';
import { sessionPendingJournal } from '@/lib/pendingJournal';
import {
  applyChangedPlannerDocuments, applyPlannerDocuments, PLANNER_STORES, plannerRefreshImpact, readPlannerDocuments, validatePlannerDocuments,
} from '@/lib/plannerSyncStores';
import { installRefreshGuard, readInputActivity, readRefreshHold } from '@/lib/refreshGuard';
import { getPlannerSync, setPlannerSync } from '@/lib/plannerSyncInstance';

export { getPlannerSync };

const useSyncState = create<{ status: SyncStatus }>(() => ({ status: INITIAL_SYNC_STATUS }));
let unsubscribe: (() => void)[] = [];
/** 탭 재진입 확인의 최소 간격. 간격 안의 요청은 끝에 한 번만 확인한다(주기 조회 없음). */
export const REFRESH_COOLDOWN_MS = 5_000;


/**
 * 저장되지 않은 수정은 이 탭(메모리·새로고침용 임시 보관)에만 있다. 그동안만 새로고침·닫기 전에 브라우저 확인 창을 띄운다.
 * 저장이 끝나면 곧바로 해제해 평소 이동을 막지 않는다.
 */
function guardUnload(dirty: boolean) {
  const guard = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  if (dirty) window.addEventListener('beforeunload', guard);
  return () => window.removeEventListener('beforeunload', guard);
}

export function startPlannerSync(userId: string): void {
  const coordinator = getPlannerSync();
  if (coordinator?.userId === userId) return;
  coordinator?.stop();
  unsubscribe.forEach((stop) => stop());
  const api = plannerSyncApi(userId);
  let releaseGuard: (() => void) | null = null;
  let guarded = false;
  const instance = new PlannerSync(userId, {
    ...api,
    apply: applyPlannerDocuments,
    validateDocuments: validatePlannerDocuments,
    onStatus: (status) => {
      useSyncState.setState({ status });
      if (status.dirty === guarded) return;
      guarded = status.dirty;
      releaseGuard?.();
      releaseGuard = guardUnload(status.dirty);
    },
    newRequestId: () => crypto.randomUUID(),
    // 새로고침 대비 임시 보관: 이 계정의 저장 전 변경분만 sessionStorage에 둔다.
    journal: sessionPendingJournal(userId),
    refreshHold: readRefreshHold,
    inputActivity: readInputActivity,
    refreshImpact: plannerRefreshImpact,
    applyRefresh: applyChangedPlannerDocuments,
  });
  setPlannerSync(instance);
  // 탭 간 조정은 하지 않는다(공유 저장소가 없다). 동시 수정은 서버 버전 충돌로 판정한다.
  unsubscribe = PLANNER_STORES.map((store) => store.subscribe(() => instance.capture(readPlannerDocuments())));
  // 탭 재표시·창 초점: 같은 틱의 중복 이벤트와 짧은 반복은 한 번의 조건부 조회로 합친다.
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const requestRefresh = () => {
    if (refreshTimer || document.visibilityState === 'hidden') return;
    const wait = Math.max(0, instance.lastReadAt() + REFRESH_COOLDOWN_MS - Date.now());
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (document.visibilityState !== 'hidden') void instance.refresh();
    }, wait);
  };
  const onVisibility = () => { if (document.visibilityState === 'visible') requestRefresh(); };
  const online = () => {
    const loaded = instance.getStatus().loaded;
    void instance.retry().then(() => { if (loaded) void instance.refresh(); });
  };
  window.addEventListener('online', online);
  window.addEventListener('focus', requestRefresh);
  document.addEventListener('visibilitychange', onVisibility);
  const removeRefreshGuard = installRefreshGuard(() => { void instance.resumeRefresh(); });
  unsubscribe.push(() => {
    window.removeEventListener('online', online);
    window.removeEventListener('focus', requestRefresh);
    document.removeEventListener('visibilitychange', onVisibility);
    removeRefreshGuard();
    if (refreshTimer) clearTimeout(refreshTimer);
  });
  unsubscribe.push(() => releaseGuard?.());
  void instance.start();
}

export function usePlannerSyncStatus(): SyncStatus {
  return useSyncExternalStore(useSyncState.subscribe, () => useSyncState.getState().status, () => INITIAL_SYNC_STATUS);
}
