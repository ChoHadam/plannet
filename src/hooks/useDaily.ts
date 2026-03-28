'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import { PlanCategory } from '@/types/mandalart';
import { DailyData, DailyTodo, createInitialDaily } from '@/types/daily';
import { generateId, sanitizeInput } from '@/lib/sanitize';

const DAILY_STORAGE_KEY = 'plannet-daily';

interface DailyStore {
  // Multiple plans support
  dailyPlans: DailyData[];
  currentDailyId: string | null;

  // Plan management
  createDailyPlan: (category: PlanCategory, year?: number, month?: number, day?: number) => string;
  selectDailyPlan: (id: string | null) => void;
  deleteDailyPlan: (id: string) => void;
  getDailyPlansByCategory: (category: PlanCategory) => DailyData[];

  // Todo operations
  addTodo: (text: string) => void;
  updateTodo: (todoId: string, text: string) => void;
  toggleTodo: (todoId: string) => void;
  deleteTodo: (todoId: string) => void;

  // Import from other plans
  importTodos: (
    items: Array<{ text: string; cellId?: string }>,
    sourceType: 'monthly' | 'block6' | 'mandalart',
    sourceId: string
  ) => void;

  // Import daily habits with dedup
  importDailyHabits: (
    habits: Array<{ text: string; cellId: string }>,
    sourceId: string
  ) => number;

  // Memo
  updateMemo: (memo: string) => void;

  // Plan metadata
  updateTitle: (title: string) => void;
  navigateDay: (direction: 'prev' | 'next') => void;
  updatePlanDate: (year?: number, month?: number, day?: number) => void;
  resetCurrent: () => void;
}

// Create initial Daily plan
const createInitialDailyPlan = (
  category: PlanCategory,
  year?: number,
  month?: number,
  day?: number
): DailyData => {
  const initial = createInitialDaily(category, year, month, day);
  return {
    ...initial,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const useDailyStore = create<DailyStore>()(
  persist(
    (set, get) => ({
      dailyPlans: [],
      currentDailyId: null,

      createDailyPlan: (category: PlanCategory, year?: number, month?: number, day?: number) => {
        const newPlan = createInitialDailyPlan(category, year, month, day);
        set((state) => ({
          dailyPlans: [...state.dailyPlans, newPlan],
          currentDailyId: newPlan.id,
        }));
        return newPlan.id;
      },

      selectDailyPlan: (id: string | null) => {
        set({ currentDailyId: id });
      },

      deleteDailyPlan: (id: string) => {
        set((state) => {
          const newPlans = state.dailyPlans.filter((p) => p.id !== id);
          const newCurrentId = state.currentDailyId === id ? null : state.currentDailyId;
          return { dailyPlans: newPlans, currentDailyId: newCurrentId };
        });
      },

      getDailyPlansByCategory: (category: PlanCategory) => {
        return get().dailyPlans.filter((p) => p.category === category);
      },

      addTodo: (text: string) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        const sanitizedText = sanitizeInput(text);
        if (!sanitizedText.trim()) return;

        const newTodo: DailyTodo = {
          id: generateId(),
          text: sanitizedText,
          completed: false,
        };

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            todos: [...plan.todos, newTodo],
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      updateTodo: (todoId: string, text: string) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        const sanitizedText = sanitizeInput(text);

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newTodos = plan.todos.map((todo) =>
            todo.id === todoId ? { ...todo, text: sanitizedText } : todo
          );

          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            todos: newTodos,
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      toggleTodo: (todoId: string) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newTodos = plan.todos.map((todo) =>
            todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
          );

          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            todos: newTodos,
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      deleteTodo: (todoId: string) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newTodos = plan.todos.filter((todo) => todo.id !== todoId);

          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            todos: newTodos,
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      importDailyHabits: (
        habits: Array<{ text: string; cellId: string }>,
        sourceId: string
      ): number => {
        const currentId = get().currentDailyId;
        if (!currentId) return 0;

        const state = get();
        const plan = state.dailyPlans.find((p) => p.id === currentId);
        if (!plan) return 0;

        // Dedup: filter out habits already imported to this plan
        const newHabits = habits.filter((habit) => {
          return !plan.todos.some(
            (todo) =>
              todo.sourceType === 'mandalart' &&
              todo.sourceId === sourceId &&
              todo.sourceCellId === habit.cellId
          );
        });

        if (newHabits.length === 0) return 0;

        const newTodos: DailyTodo[] = newHabits.map((habit) => ({
          id: generateId(),
          text: sanitizeInput(habit.text),
          completed: false,
          sourceType: 'mandalart' as const,
          sourceId,
          sourceCellId: habit.cellId,
        }));

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            todos: [...plan.todos, ...newTodos],
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });

        return newTodos.length;
      },

      importTodos: (
        items: Array<{ text: string; cellId?: string }>,
        sourceType: 'monthly' | 'block6' | 'mandalart',
        sourceId: string
      ) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        const newTodos: DailyTodo[] = items.map((item) => ({
          id: generateId(),
          text: sanitizeInput(item.text),
          completed: false,
          sourceType,
          sourceId,
          sourceCellId: item.cellId,
        }));

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            todos: [...plan.todos, ...newTodos],
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      updateMemo: (memo: string) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        const sanitizedMemo = sanitizeInput(memo);

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            memo: sanitizedMemo,
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      updateTitle: (title: string) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        const sanitizedTitle = sanitizeInput(title);

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            title: sanitizedTitle,
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      navigateDay: (direction: 'prev' | 'next') => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const currentDate = new Date(plan.year, plan.month - 1, plan.day);

          if (direction === 'prev') {
            currentDate.setDate(currentDate.getDate() - 1);
          } else {
            currentDate.setDate(currentDate.getDate() + 1);
          }

          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            year: currentDate.getFullYear(),
            month: currentDate.getMonth() + 1,
            day: currentDate.getDate(),
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      updatePlanDate: (year?: number, month?: number, day?: number) => {
        const currentId = get().currentDailyId;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.dailyPlans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.dailyPlans[planIndex];
          const newPlans = [...state.dailyPlans];
          newPlans[planIndex] = {
            ...plan,
            year: year ?? plan.year,
            month: month ?? plan.month,
            day: day ?? plan.day,
            updatedAt: new Date().toISOString(),
          };

          return { dailyPlans: newPlans };
        });
      },

      resetCurrent: () => {
        set({ currentDailyId: null });
      },
    }),
    {
      name: DAILY_STORAGE_KEY,
      partialize: (state) => ({
        dailyPlans: state.dailyPlans,
        currentDailyId: state.currentDailyId,
      }),
    }
  )
);

// Hydration hook
export const useDailyHydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsubscribe = useDailyStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    if (useDailyStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  return hydrated;
};
