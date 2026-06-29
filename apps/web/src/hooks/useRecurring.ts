'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import { RecurringTodo } from '@/types/recurring';
import { TodoColor } from '@/types/block6';
import { generateId, sanitizeInput } from '@/lib/sanitize';

const STORAGE_KEY = 'plannet-recurring';

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
    }
  )
);

export const useRecurringHydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsubscribe = useRecurringStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    if (useRecurringStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    return () => { unsubscribe(); };
  }, []);

  return hydrated;
};
