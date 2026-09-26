'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { INITIAL_SYNC_STATUS, PlannerSync, SyncStatus, syncStorageKey } from '@/lib/plannerSync';
import { plannerSyncApi } from '@/lib/plannerSyncApi';
import { applyPlannerDocuments, PLANNER_STORES, readPlannerDocuments } from '@/lib/plannerSyncStores';

const useSyncState = create<{ status: SyncStatus }>(() => ({ status: INITIAL_SYNC_STATUS }));
let coordinator: PlannerSync | null = null;
let unsubscribe: (() => void)[] = [];

export function getPlannerSync(): PlannerSync | null { return coordinator; }

export function startPlannerSync(userId: string): void {
  if (coordinator?.userId === userId) return;
  coordinator?.stop();
  unsubscribe.forEach((stop) => stop());
  const api = plannerSyncApi(userId);
  const instance = new PlannerSync(userId, {
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    ...api,
    apply: applyPlannerDocuments,
    onStatus: (status) => useSyncState.setState({ status }),
    newRequestId: () => crypto.randomUUID(),
  });
  coordinator = instance;
  unsubscribe = PLANNER_STORES.map((store) => store.subscribe(() => instance.capture(readPlannerDocuments())));
  const online = () => { void instance.retry(); };
  window.addEventListener('online', online);
  unsubscribe.push(() => window.removeEventListener('online', online));
  // Each tab owns a local draft. Never race writes to the same durable envelope.
  const key = syncStorageKey(userId);
  const changed = (event: StorageEvent) => {
    if (event.key !== key || event.newValue === event.oldValue) return;
    instance.stop();
    let archived = true;
    if (instance.getStatus().pendingCount > 0 || instance.getSnapshot().inflight) {
      try { localStorage.setItem(`${key}:backup:${crypto.randomUUID()}`, instance.backupText()); }
      catch { archived = false; }
    }
    useSyncState.setState({ status: {
      ...instance.getStatus(), ready: false, phase: 'error',
      message: archived
        ? '같은 계정의 다른 탭에서 기록이 바뀌었어요. 이 탭의 초안은 따로 보관했어요. 새로고침해주세요.'
        : '같은 계정의 다른 탭에서 기록이 바뀌었어요. 이 탭의 초안을 파일로 저장한 뒤 새로고침해주세요.',
    } });
  };
  window.addEventListener('storage', changed);
  unsubscribe.push(() => window.removeEventListener('storage', changed));
  void instance.start();
}

export function usePlannerSyncStatus(): SyncStatus {
  return useSyncExternalStore(useSyncState.subscribe, () => useSyncState.getState().status, () => INITIAL_SYNC_STATUS);
}
