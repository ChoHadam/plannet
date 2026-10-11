'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePersistHydrated } from '@/hooks/usePersistHydrated';
import { plannerStorage, PLANNER_STORAGE_KEYS } from '@/lib/plannerStorage';
import { ManualHoliday, ManualHolidayMap, toIsoDate } from '@/lib/holidays';

const STORAGE_KEY = PLANNER_STORAGE_KEYS.holidays;

interface HolidayStore {
  manualHolidays: ManualHolidayMap;
  setManualHoliday: (date: Date, name?: string) => void;
  removeManualHoliday: (date: Date) => void;
  toggleManualHoliday: (date: Date, name?: string) => void;
}

export const useHolidayStore = create<HolidayStore>()(
  persist(
    (set, get) => ({
      manualHolidays: {},

      setManualHoliday: (date: Date, name?: string) => {
        const iso = toIsoDate(date);
        const entry: ManualHoliday = {
          date: iso,
          name,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          manualHolidays: { ...state.manualHolidays, [iso]: entry },
        }));
      },

      removeManualHoliday: (date: Date) => {
        const iso = toIsoDate(date);
        set((state) => {
          if (!state.manualHolidays[iso]) return state;
          const next = { ...state.manualHolidays };
          delete next[iso];
          return { manualHolidays: next };
        });
      },

      toggleManualHoliday: (date: Date, name?: string) => {
        const iso = toIsoDate(date);
        const has = !!get().manualHolidays[iso];
        if (has) {
          get().removeManualHoliday(date);
        } else {
          get().setManualHoliday(date, name);
        }
      },
    }),
    {
      name: STORAGE_KEY,
      // 계정 범위가 정해진 뒤 usePlannerStorageHydration에서 한 번에 복원한다.
      storage: plannerStorage,
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        manualHolidays: state.manualHolidays,
      }),
    },
  ),
);

// 복원 완료 여부 (복원 시작은 usePlannerStorageHydration 담당)
export const useHolidayHydration = (): boolean => usePersistHydrated(useHolidayStore);
