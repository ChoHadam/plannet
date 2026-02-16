'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import { PlanCategory } from '@/types/mandalart';
import {
  MonthlyData,
  MonthlyGoal,
  WeeklyFocus,
  CalendarEvent,
  createInitialWeeklyFocus,
} from '@/types/monthly';
import { generateId, sanitizeInput } from '@/lib/sanitize';

const MONTHLY_STORAGE_KEY = 'plannet-monthly';

interface MonthlyStore {
  // Multiple plans support
  monthlyPlans: MonthlyData[];
  currentMonthlyId: string | null;

  // Computed getter
  data: MonthlyData | null;

  // Plan management
  createMonthlyPlan: (category: PlanCategory, year?: number, month?: number) => string;
  selectMonthlyPlan: (id: string | null) => void;
  deleteMonthlyPlan: (id: string) => void;
  getMonthlyPlansByCategory: (category: PlanCategory) => MonthlyData[];

  // Goal operations
  addGoal: (text: string) => void;
  updateGoal: (goalId: string, text: string) => void;
  updateGoalProgress: (goalId: string, progress: number) => void;
  toggleGoalCompleted: (goalId: string) => void;
  deleteGoal: (goalId: string) => void;
  importActionPlans: (actionPlans: string[], sourceMandalartId?: string) => void;

  // Weekly focus operations
  updateWeeklyFocus: (weekNumber: number, text: string) => void;

  // Event operations
  addEvent: (date: number, text: string, color?: string) => void;
  updateEvent: (eventId: string, text: string) => void;
  updateEventColor: (eventId: string, color: string) => void;
  deleteEvent: (eventId: string) => void;

  // Memo
  updateMemo: (memo: string) => void;

  // Plan metadata
  updateTitle: (title: string) => void;
  navigateMonth: (direction: 'prev' | 'next') => void;
  resetCurrent: () => void;
}

// Create initial empty Monthly plan
const createInitialMonthlyPlan = (
  category: PlanCategory,
  year?: number,
  month?: number
): MonthlyData => {
  const now = new Date();
  const planYear = year ?? now.getFullYear();
  const planMonth = month ?? now.getMonth() + 1;

  return {
    id: generateId(),
    title: '',
    category,
    template: 'monthly',
    year: planYear,
    month: planMonth,
    goals: [],
    weeklyFocus: createInitialWeeklyFocus(),
    events: [],
    memo: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const useMonthlyStore = create<MonthlyStore>()(
  persist(
    (set, get) => ({
      monthlyPlans: [],
      currentMonthlyId: null,

      get data() {
        const state = get();
        if (!state.currentMonthlyId) return null;
        return state.monthlyPlans.find((p) => p.id === state.currentMonthlyId) || null;
      },

      createMonthlyPlan: (category: PlanCategory, year?: number, month?: number) => {
        const newPlan = createInitialMonthlyPlan(category, year, month);
        set((state) => ({
          monthlyPlans: [newPlan, ...state.monthlyPlans],
          currentMonthlyId: newPlan.id,
        }));
        return newPlan.id;
      },

      selectMonthlyPlan: (id: string | null) => {
        set({ currentMonthlyId: id });
      },

      deleteMonthlyPlan: (id: string) => {
        set((state) => {
          const newPlans = state.monthlyPlans.filter((p) => p.id !== id);
          const newCurrentId = state.currentMonthlyId === id ? null : state.currentMonthlyId;
          return {
            monthlyPlans: newPlans,
            currentMonthlyId: newCurrentId,
          };
        });
      },

      getMonthlyPlansByCategory: (category: PlanCategory) => {
        return get().monthlyPlans.filter((p) => p.category === category);
      },

      // Goal operations
      addGoal: (text: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const trimmedText = sanitizeInput(text);
        if (!trimmedText) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          if (plan.goals.length >= 5) return state; // Max 5 goals

          const newGoal: MonthlyGoal = {
            id: generateId(),
            text: trimmedText,
            progress: 0,
            completed: false,
          };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            goals: [...plan.goals, newGoal],
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      updateGoal: (goalId: string, text: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const trimmedText = sanitizeInput(text);

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const goalIndex = plan.goals.findIndex((g) => g.id === goalId);
          if (goalIndex === -1) return state;

          const newGoals = [...plan.goals];
          newGoals[goalIndex] = { ...newGoals[goalIndex], text: trimmedText };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            goals: newGoals,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      updateGoalProgress: (goalId: string, progress: number) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const clampedProgress = Math.max(0, Math.min(100, progress));

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const goalIndex = plan.goals.findIndex((g) => g.id === goalId);
          if (goalIndex === -1) return state;

          const newGoals = [...plan.goals];
          newGoals[goalIndex] = {
            ...newGoals[goalIndex],
            progress: clampedProgress,
            completed: clampedProgress === 100,
          };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            goals: newGoals,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      toggleGoalCompleted: (goalId: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const goalIndex = plan.goals.findIndex((g) => g.id === goalId);
          if (goalIndex === -1) return state;

          const goal = plan.goals[goalIndex];
          const newCompleted = !goal.completed;

          const newGoals = [...plan.goals];
          newGoals[goalIndex] = {
            ...goal,
            completed: newCompleted,
            progress: newCompleted ? 100 : 0,
          };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            goals: newGoals,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      deleteGoal: (goalId: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const newGoals = plan.goals.filter((g) => g.id !== goalId);

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            goals: newGoals,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      importActionPlans: (actionPlans: string[], sourceMandalartId?: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const availableSlots = 5 - plan.goals.length;
          if (availableSlots <= 0) return state;

          // 최대 남은 슬롯만큼만 추가
          const plansToAdd = actionPlans.slice(0, availableSlots);

          const newGoals: MonthlyGoal[] = plansToAdd.map((text) => ({
            id: generateId(),
            text: sanitizeInput(text),
            progress: 0,
            completed: false,
            sourceMandalartId,
          }));

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            goals: [...plan.goals, ...newGoals],
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      // Weekly focus operations
      updateWeeklyFocus: (weekNumber: number, text: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const trimmedText = sanitizeInput(text);

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const weekIndex = plan.weeklyFocus.findIndex((w) => w.weekNumber === weekNumber);
          if (weekIndex === -1) return state;

          const newWeeklyFocus = [...plan.weeklyFocus];
          newWeeklyFocus[weekIndex] = { ...newWeeklyFocus[weekIndex], text: trimmedText };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            weeklyFocus: newWeeklyFocus,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      // Event operations
      addEvent: (date: number, text: string, color?: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const trimmedText = sanitizeInput(text);
        if (!trimmedText) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const newEvent: CalendarEvent = {
            id: generateId(),
            date,
            text: trimmedText,
            color,
          };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            events: [...plan.events, newEvent],
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      updateEvent: (eventId: string, text: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const trimmedText = sanitizeInput(text);

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const eventIndex = plan.events.findIndex((e) => e.id === eventId);
          if (eventIndex === -1) return state;

          const newEvents = [...plan.events];
          newEvents[eventIndex] = { ...newEvents[eventIndex], text: trimmedText };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            events: newEvents,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      updateEventColor: (eventId: string, color: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const eventIndex = plan.events.findIndex((e) => e.id === eventId);
          if (eventIndex === -1) return state;

          const newEvents = [...plan.events];
          newEvents[eventIndex] = { ...newEvents[eventIndex], color };

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            events: newEvents,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      deleteEvent: (eventId: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          const newEvents = plan.events.filter((e) => e.id !== eventId);

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            events: newEvents,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      // Memo
      updateMemo: (memo: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const sanitizedMemo = sanitizeInput(memo);

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...newPlans[planIndex],
            memo: sanitizedMemo,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      // Plan metadata
      updateTitle: (title: string) => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        const sanitizedTitle = sanitizeInput(title);

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...newPlans[planIndex],
            title: sanitizedTitle,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      navigateMonth: (direction: 'prev' | 'next') => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.monthlyPlans[planIndex];
          let newYear = plan.year;
          let newMonth = plan.month;

          if (direction === 'prev') {
            newMonth -= 1;
            if (newMonth < 1) {
              newMonth = 12;
              newYear -= 1;
            }
          } else {
            newMonth += 1;
            if (newMonth > 12) {
              newMonth = 1;
              newYear += 1;
            }
          }

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = {
            ...plan,
            year: newYear,
            month: newMonth,
            updatedAt: new Date().toISOString(),
          };

          return { monthlyPlans: newPlans };
        });
      },

      resetCurrent: () => {
        const currentId = get().currentMonthlyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.monthlyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const oldPlan = state.monthlyPlans[planIndex];
          const newPlan = createInitialMonthlyPlan(oldPlan.category, oldPlan.year, oldPlan.month);
          newPlan.id = oldPlan.id;
          newPlan.title = oldPlan.title;

          const newPlans = [...state.monthlyPlans];
          newPlans[planIndex] = newPlan;

          return { monthlyPlans: newPlans };
        });
      },
    }),
    {
      name: MONTHLY_STORAGE_KEY,
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        monthlyPlans: state.monthlyPlans,
        currentMonthlyId: state.currentMonthlyId,
      }),
    }
  )
);

// Hydration hook for Next.js
export const useMonthlyHydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useMonthlyStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  return hydrated;
};
