'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { useRecurringStore } from '@/hooks/useRecurring';
import { useHolidayStore } from '@/hooks/useHolidays';
import { getPlannerStorageScope, setPlannerStorageScope } from '@/lib/plannerStorage';

const PLANNER_STORES = [
  useMandalartStore,
  useBlock6Store,
  useMonthlyStore,
  useDailyStore,
  useRecurringStore,
  useHolidayStore,
];

/**
 * 로그인 상태 확인이 끝나 저장 범위가 정해지면 모든 플래너 store를 그 범위에서 복원한다.
 * 한 페이지 수명 동안 범위는 하나다. 로그인·로그아웃은 페이지를 새로 불러오며 범위를 바꾼다.
 */
export function usePlannerStorageHydration(): void {
  const { storageScope } = useAuth();

  useEffect(() => {
    if (!storageScope) return;

    const current = getPlannerStorageScope();
    if (current === storageScope) return;
    if (current !== null) {
      // 같은 페이지에서 계정이 바뀌면 메모리의 이전 계정 데이터가 섞이지 않도록 새로 불러온다.
      window.location.reload();
      return;
    }

    setPlannerStorageScope(storageScope);
    PLANNER_STORES.forEach((store) => store.persist.rehydrate());
  }, [storageScope]);
}
