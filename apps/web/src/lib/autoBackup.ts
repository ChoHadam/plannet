'use client';

import { useEffect, useState } from 'react';
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

/** 현재 브라우저에서 자동 백업과 자동 복원을 사용할지 여부 (새 브라우저 기본값 false) */
export function getBackupAutomationEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(AUTO_BACKUP_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 현재 브라우저의 백업 자동화 설정을 저장하고, 비활성화 시 예약된 백업을 취소 */
export function setBackupAutomationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, String(enabled));
  } catch {
    // localStorage를 사용할 수 없는 환경에서는 백업 자동화를 활성화하지 않음
    return;
  }

  if (!enabled && pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

async function performBackup() {
  if (!getBackupAutomationEnabled()) return;

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
  if (!getBackupAutomationEnabled()) {
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

/**
 * 백업 데이터를 localStorage에 적용. 적용 후 페이지 리로드.
 * persist key 형식: { state: <data>, version: <n> }
 */
/** 현재 비어있는 스토어 식별 */
function getEmptyStores() {
  return {
    mandalart: useMandalartStore.getState().mandalarts.length === 0,
    block6: useBlock6Store.getState().block6Plans.length === 0,
    monthly: useMonthlyStore.getState().monthlyPlans.length === 0,
    daily: useDailyStore.getState().dailyPlans.length === 0,
    recurring: useRecurringStore.getState().todos.length === 0,
    holidays: Object.keys(useHolidayStore.getState().manualHolidays).length === 0,
  };
}

/** 백업의 각 스토어가 데이터를 가지고 있는지 */
function getBackupHasData(snap: SnapshotData) {
  return {
    mandalart: ((snap.mandalart as { mandalarts?: unknown[] })?.mandalarts?.length ?? 0) > 0,
    block6: ((snap.block6 as { block6Plans?: unknown[] })?.block6Plans?.length ?? 0) > 0,
    monthly: ((snap.monthly as { monthlyPlans?: unknown[] })?.monthlyPlans?.length ?? 0) > 0,
    daily: ((snap.daily as { dailyPlans?: unknown[] })?.dailyPlans?.length ?? 0) > 0,
    recurring: ((snap.recurring as { todos?: unknown[] })?.todos?.length ?? 0) > 0,
    holidays: Object.keys(((snap.holidays as { manualHolidays?: Record<string, unknown> })?.manualHolidays) ?? {}).length > 0,
  };
}

/** 비어있는 스토어만 골라 setState로 복원 (다른 스토어는 그대로 유지) */
function restoreEmptyStores(snap: SnapshotData, targets: ReturnType<typeof getEmptyStores>): string[] {
  const restored: string[] = [];
  if (targets.mandalart) {
    useMandalartStore.setState(snap.mandalart as Parameters<typeof useMandalartStore.setState>[0]);
    restored.push('만다라트');
  }
  if (targets.block6) {
    useBlock6Store.setState(snap.block6 as Parameters<typeof useBlock6Store.setState>[0]);
    restored.push('Block6');
  }
  if (targets.monthly) {
    useMonthlyStore.setState(snap.monthly as Parameters<typeof useMonthlyStore.setState>[0]);
    restored.push('월간');
  }
  if (targets.daily) {
    useDailyStore.setState(snap.daily as Parameters<typeof useDailyStore.setState>[0]);
    restored.push('투두리스트');
  }
  if (targets.recurring) {
    useRecurringStore.setState(snap.recurring as Parameters<typeof useRecurringStore.setState>[0]);
    restored.push('고정 할일');
  }
  if (targets.holidays) {
    useHolidayStore.setState(snap.holidays as Parameters<typeof useHolidayStore.setState>[0]);
    restored.push('공휴일');
  }
  // 즉시 백업이 다시 생성되지 않도록 lastBackupAt 갱신
  lastBackupAt = Date.now();
  return restored;
}

export interface AutoRestoreResult {
  createdAt: string;
  restoredStores: string[];
}

/**
 * 페이지 로드 시 비어있는 스토어가 있는데 백업에 데이터가 있으면 자동 복원.
 * 부분 손실(예: 월간만 사라짐)도 감지하여 해당 스토어만 복원.
 * dev 모드 편의를 위해 매 새로고침마다 검사 (sessionStorage 플래그 사용 안 함).
 */
export function useAutoRestore(allHydrated: boolean) {
  const [result, setResult] = useState<AutoRestoreResult | null>(null);

  useEffect(() => {
    if (!allHydrated) return;
    if (typeof window === 'undefined') return;
    if (!getBackupAutomationEnabled()) return;

    const empty = getEmptyStores();
    const anyEmpty = Object.values(empty).some(Boolean);

    if (!anyEmpty) return;

    // 비어있는 스토어가 있음 → 해당 스토어에 데이터를 가진 가장 최근 백업 찾기
    let cancelled = false;
    (async () => {
      const backups = await listBackups();
      for (const b of backups) {
        if (cancelled) return;
        const snap = await loadBackup(b.filename);
        if (!snap) continue;
        const has = getBackupHasData(snap);
        const targets = {
          mandalart: empty.mandalart && has.mandalart,
          block6: empty.block6 && has.block6,
          monthly: empty.monthly && has.monthly,
          daily: empty.daily && has.daily,
          recurring: empty.recurring && has.recurring,
          holidays: empty.holidays && has.holidays,
        };
        if (Object.values(targets).some(Boolean)) {
          const restoredStores = restoreEmptyStores(snap, targets);
          if (!cancelled) setResult({ createdAt: b.createdAt, restoredStores });
          break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [allHydrated]);

  return result;
}

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
  localStorage.setItem('plannet-holidays', wrap(snap.holidays as State<unknown>, 'plannet-holidays'));

  window.location.reload();
}
