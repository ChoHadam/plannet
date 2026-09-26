'use client';

import { useSyncExternalStore } from 'react';

interface PersistApi {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
}

const getServerSnapshot = () => false;

/**
 * persist store의 복원 완료 여부를 구독한다.
 * 복원을 직접 시작하지 않는다. 시작은 usePlannerStorageHydration이 계정 범위를 정한 뒤 한다.
 */
export function usePersistHydrated(store: PersistApi): boolean {
  return useSyncExternalStore(
    (onChange) => store.persist.onFinishHydration(onChange),
    () => store.persist.hasHydrated(),
    getServerSnapshot,
  );
}
