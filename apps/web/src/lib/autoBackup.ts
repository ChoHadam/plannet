'use client';

import { useEffect } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { useRecurringStore } from '@/hooks/useRecurring';
import { useHolidayStore } from '@/hooks/useHolidays';

const DEBOUNCE_MS = 2000; // 변경 후 2초 idle 시 백업
const MIN_INTERVAL_MS = 30_000; // 직전 백업 후 30초 미만이면 스킵 (스팸 방지)
const AUTO_BACKUP_ENABLED_KEY = 'plannet-auto-backup-enabled';

interface SnapshotData {
  mandalart: unknown;
  block6: unknown;
  monthly: unknown;
  daily: unknown;
  recurring: unknown;
  holidays: unknown;
  timestamp: string;
}

function buildSnapshot(): SnapshotData {
  return {
    mandalart: useMandalartStore.getState(),
    block6: useBlock6Store.getState(),
    monthly: useMonthlyStore.getState(),
    daily: useDailyStore.getState(),
    recurring: useRecurringStore.getState(),
    holidays: useHolidayStore.getState(),
    timestamp: new Date().toISOString(),
  };
}

let lastBackupAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/** 현재 브라우저에서 자동 백업을 사용할지 여부 (새 브라우저 기본값 false) */
export function getAutoBackupEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(AUTO_BACKUP_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 현재 브라우저의 자동 백업 설정을 저장하고, 비활성화 시 예약된 백업을 취소 */
export function setAutoBackupEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, String(enabled));
  } catch {
    // localStorage를 사용할 수 없는 환경에서는 자동 백업을 활성화하지 않음
    return;
  }

  if (!enabled && pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

async function performBackup() {
  if (!getAutoBackupEnabled()) return;

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
    holidays: {
      manualHolidays: (snap.holidays as { manualHolidays: Record<string, unknown> }).manualHolidays,
    },
    timestamp: snap.timestamp,
  };

  // 모든 스토어가 비어있으면 백업 스킵 (초기 로딩 직후 빈 상태 저장 방지)
  const totalCount =
    serializable.mandalart.mandalarts.length +
    serializable.block6.block6Plans.length +
    serializable.monthly.monthlyPlans.length +
    serializable.daily.dailyPlans.length +
    serializable.recurring.todos.length +
    Object.keys(serializable.holidays.manualHolidays || {}).length;
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
  if (!getAutoBackupEnabled()) {
    pendingTimer = null;
    return;
  }

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
    const unsubHolidays = useHolidayStore.subscribe(scheduleBackup);

    return () => {
      unsubMandalart();
      unsubBlock6();
      unsubMonthly();
      unsubDaily();
      unsubRecurring();
      unsubHolidays();
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

/** 스냅샷 전체를 각 Zustand store에 적용해 현재 persist 버전으로 저장 */
function applySnapshotToStores(snap: SnapshotData) {
  useMandalartStore.setState(snap.mandalart as Parameters<typeof useMandalartStore.setState>[0]);
  useBlock6Store.setState(snap.block6 as Parameters<typeof useBlock6Store.setState>[0]);
  useMonthlyStore.setState(snap.monthly as Parameters<typeof useMonthlyStore.setState>[0]);
  useDailyStore.setState(snap.daily as Parameters<typeof useDailyStore.setState>[0]);
  useRecurringStore.setState(snap.recurring as Parameters<typeof useRecurringStore.setState>[0]);
  useHolidayStore.setState(snap.holidays as Parameters<typeof useHolidayStore.setState>[0]);
}

export function applyBackup(snap: SnapshotData) {
  applySnapshotToStores(snap);
  lastBackupAt = Date.now();

  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  window.location.reload();
}
