'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePersistHydrated } from '@/hooks/usePersistHydrated';
import { plannerStorage, PLANNER_STORAGE_KEYS } from '@/lib/plannerStorage';
import { RecurringTodo } from '@/types/recurring';
import { TodoColor } from '@/types/block6';
import { generateId, sanitizeInput } from '@/lib/sanitize';

const STORAGE_KEY = PLANNER_STORAGE_KEYS.recurring;

interface RecurringStore {
  todos: RecurringTodo[];
  addTodo: (text: string) => void;
  updateTodo: (id: string, text: string) => void;
  updateColor: (id: string, color: TodoColor) => void;
  deleteTodo: (id: string) => void;
}

export const useRecurringStore = create<RecurringStore>()(
  persist(
    (set) => ({
      todos: [],

      addTodo: (text: string) => {
        const sanitized = sanitizeInput(text);
        if (!sanitized.trim()) return;

        set((state) => ({
          todos: [...state.todos, {
            id: generateId(),
            text: sanitized,
            createdAt: new Date().toISOString(),
          }],
        }));
      },

      updateTodo: (id: string, text: string) => {
        const sanitized = sanitizeInput(text);
        set((state) => ({
          todos: state.todos.map(t => t.id === id ? { ...t, text: sanitized } : t),
        }));
      },

      updateColor: (id: string, color: TodoColor) => {
        set((state) => ({
          todos: state.todos.map(t => t.id === id ? { ...t, color } : t),
        }));
      },

      deleteTodo: (id: string) => {
        set((state) => ({
          todos: state.todos.filter(t => t.id !== id),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      // 계정 범위가 정해진 뒤 usePlannerStorageHydration에서 한 번에 복원한다.
      storage: plannerStorage,
      skipHydration: true,
    }
  )
);

// 복원 완료 여부 (복원 시작은 usePlannerStorageHydration 담당)
export const useRecurringHydration = (): boolean => usePersistHydrated(useRecurringStore);
