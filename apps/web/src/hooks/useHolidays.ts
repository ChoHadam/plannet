'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import { ManualHoliday, ManualHolidayMap, toIsoDate } from '@/lib/holidays';

const STORAGE_KEY = 'plannet-holidays';

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
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        manualHolidays: state.manualHolidays,
      }),
    },
  ),
);

export const useHolidayHydration = (): boolean => {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    useHolidayStore.persist.rehydrate();
    setHydrated(true);
  }, []);
  return hydrated;
};
