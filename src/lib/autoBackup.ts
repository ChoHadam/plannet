'use client';

import { useEffect } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { useRecurringStore } from '@/hooks/useRecurring';

const DEBOUNCE_MS = 2000; // 변경 후 2초 idle 시 백업
const MIN_INTERVAL_MS = 30_000; // 직전 백업 후 30초 미만이면 스킵 (스팸 방지)

interface SnapshotData {
  mandalart: unknown;
  block6: unknown;
  monthly: unknown;
  daily: unknown;
  recurring: unknown;
  timestamp: string;
}

function buildSnapshot(): SnapshotData {
  return {
    mandalart: useMandalartStore.getState(),
    block6: useBlock6Store.getState(),
    monthly: useMonthlyStore.getState(),
    daily: useDailyStore.getState(),
    recurring: useRecurringStore.getState(),
    timestamp: new Date().toISOString(),
  };
}

let lastBackupAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

async function performBackup() {
  // 모든 스토어 데이터를 plain object로 직렬화 (함수 제외)
  const snap = buildSnapshot();
  const serializable = {
    mandalart: {
      mandalarts: (snap.mandalart as { mandalarts: unknown[] }).mandalarts,
      currentId: (snap.mandalart as { currentId: string | null }).currentId,
    },
    block6: {
      block6Plans: (snap.block6 as { block6Plans: unknown[] }).block6Plans,
      currentBlock6Id: (snap.block6 as { currentBlock6Id: string | null }).currentBlock6Id,
    },
    monthly: {
      monthlyPlans: (snap.monthly as { monthlyPlans: unknown[] }).monthlyPlans,
      currentMonthlyId: (snap.monthly as { currentMonthlyId: string | null }).currentMonthlyId,
    },
    daily: {
      dailyPlans: (snap.daily as { dailyPlans: unknown[] }).dailyPlans,
      currentDailyId: (snap.daily as { currentDailyId: string | null }).currentDailyId,
    },
    recurring: {
      todos: (snap.recurring as { todos: unknown[] }).todos,
    },
    timestamp: snap.timestamp,
  };

  // 모든 스토어가 비어있으면 백업 스킵 (초기 로딩 직후 빈 상태 저장 방지)
  const totalCount =
    serializable.mandalart.mandalarts.length +
    serializable.block6.block6Plans.length +
    serializable.monthly.monthlyPlans.length +
    serializable.daily.dailyPlans.length +
    serializable.recurring.todos.length;
  if (totalCount === 0) return;

  try {
    await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializable),
    });
    lastBackupAt = Date.now();
  } catch (err) {
    console.warn('[auto-backup] failed:', err);
  }
}

function scheduleBackup() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (Date.now() - lastBackupAt < MIN_INTERVAL_MS) {
      // 직전 백업 후 30초 안 지났으면 다시 스케줄
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        performBackup();
      }, MIN_INTERVAL_MS);
      return;
    }
    performBackup();
  }, DEBOUNCE_MS);
}

/**
 * 모든 store의 변경을 구독하고 디바운스된 자동 백업을 수행.
 * 페이지 한 곳에서 한 번 호출하면 됨.
 */
export function useAutoBackup() {
  useEffect(() => {
    // 각 store의 변경 구독
    const unsubMandalart = useMandalartStore.subscribe(scheduleBackup);
    const unsubBlock6 = useBlock6Store.subscribe(scheduleBackup);
    const unsubMonthly = useMonthlyStore.subscribe(scheduleBackup);
    const unsubDaily = useDailyStore.subscribe(scheduleBackup);
    const unsubRecurring = useRecurringStore.subscribe(scheduleBackup);

    return () => {
      unsubMandalart();
      unsubBlock6();
      unsubMonthly();
      unsubDaily();
      unsubRecurring();
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, []);
}

export interface BackupItem {
  filename: string;
  createdAt: string;
  size: number;
}

export async function listBackups(): Promise<BackupItem[]> {
  try {
    const res = await fetch('/api/backup');
    const json = await res.json();
    return json.ok ? json.backups : [];
  } catch {
    return [];
  }
}

export async function loadBackup(filename: string): Promise<SnapshotData | null> {
  try {
    const res = await fetch(`/api/backup?file=${encodeURIComponent(filename)}`);
    const json = await res.json();
    return json.ok ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * 백업 데이터를 localStorage에 적용. 적용 후 페이지 리로드.
 * persist key 형식: { state: <data>, version: <n> }
 */
export function applyBackup(snap: SnapshotData) {
  type State<T> = T & { version?: number };
  const wrap = <T>(data: T, key: string) => {
    const existing = localStorage.getItem(key);
    let version = 0;
    try {
      version = existing ? (JSON.parse(existing).version ?? 0) : 0;
    } catch {
      version = 0;
    }
    return JSON.stringify({ state: data, version });
  };

  localStorage.setItem('plannet-mandalart', wrap(snap.mandalart as State<unknown>, 'plannet-mandalart'));
  localStorage.setItem('plannet-block6', wrap(snap.block6 as State<unknown>, 'plannet-block6'));
  localStorage.setItem('plannet-monthly', wrap(snap.monthly as State<unknown>, 'plannet-monthly'));
  localStorage.setItem('plannet-daily', wrap(snap.daily as State<unknown>, 'plannet-daily'));
  localStorage.setItem('plannet-recurring', wrap(snap.recurring as State<unknown>, 'plannet-recurring'));

  window.location.reload();
}
