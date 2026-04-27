'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect, useState } from 'react';
import { PlanCategory } from '@/types/mandalart';
import {
  Block6Data,
  BlockData,
  BlockNumber,
  DayOfWeek,
  DAYS_OF_WEEK,
  TodoItem,
  TodoColor,
} from '@/types/block6';
import { generateId, sanitizeInput } from '@/lib/sanitize';

const BLOCK6_STORAGE_KEY = 'plannet-block6';

interface Block6Store {
  // Multiple plans support
  block6Plans: Block6Data[];
  currentBlock6Id: string | null;

  // Computed getter
  data: Block6Data | null;

  // Plan management
  createBlock6Plan: (category: PlanCategory, title?: string) => string;
  selectBlock6Plan: (id: string) => void;
  deleteBlock6Plan: (id: string) => void;
  getBlock6PlansByCategory: (category: PlanCategory) => Block6Data[];

  // Block operations
  updateBlockKeyword: (blockId: string, keyword: string) => void;
  updateBlockColor: (blockId: string, color: string) => void;

  // Todo operations (for blocks)
  addTodo: (blockId: string, text: string) => void;
  updateTodo: (blockId: string, todoId: string, text: string) => void;
  toggleTodo: (blockId: string, todoId: string) => void;
  deleteTodo: (blockId: string, todoId: string) => void;
  updateTodoColor: (blockId: string, todoId: string, color: TodoColor) => void;
  duplicateTodo: (blockId: string, todoId: string) => void;

  // Backlog operations
  addBacklogTodo: (text: string) => void;
  updateBacklogTodo: (todoId: string, text: string) => void;
  toggleBacklogTodo: (todoId: string) => void;
  deleteBacklogTodo: (todoId: string) => void;
  updateBacklogTodoColor: (todoId: string, color: TodoColor) => void;
  duplicateBacklogTodo: (todoId: string) => void;

  // Reorder within same container
  reorderBlockTodo: (blockId: string, fromIndex: number, toIndex: number) => void;
  reorderBacklogTodo: (fromIndex: number, toIndex: number) => void;

  // Drag and drop operations
  moveTodo: (
    todoId: string,
    sourceType: 'backlog' | 'block',
    sourceId: string | null,
    destType: 'backlog' | 'block',
    destId: string | null
  ) => void;

  // Plan metadata
  updateTitle: (title: string) => void;
  updateCustomFocus: (focus: string) => void;
  updatePlanDate: (year?: number, month?: number, week?: number, day?: number) => void;
  resetCurrent: () => void;
}

// Get Monday-based week number within the month
const getWeekNumberInMonth = (date: Date): number => {
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayDate = day - daysFromMonday;

  if (mondayDate < 1) {
    return 1;
  }

  const year = date.getFullYear();
  const month = date.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstDayOfWeek = firstOfMonth.getDay();
  const daysToFirstMonday = firstDayOfWeek === 0 ? 1 : firstDayOfWeek === 1 ? 0 : 8 - firstDayOfWeek;
  const firstMondayDate = 1 + daysToFirstMonday;

  const weekNum = Math.floor((mondayDate - firstMondayDate) / 7) + 1;
  return Math.max(1, weekNum);
};

// Create 42 empty blocks (7 days x 6 blocks)
const createInitialBlocks = (): BlockData[] => {
  const blocks: BlockData[] = [];
  const blockNumbers: BlockNumber[] = [1, 2, 3, 4, 5, 6];

  for (const day of DAYS_OF_WEEK) {
    for (const blockNumber of blockNumbers) {
      blocks.push({
        id: `${day}-${blockNumber}`,
        blockNumber,
        day,
        keyword: '',
        todos: [],
      });
    }
  }

  return blocks;
};

// Create initial empty Block6 plan
const createInitialBlock6Plan = (category: PlanCategory, title: string = ''): Block6Data => {
  const now = new Date();
  const year = now.getFullYear();
  const month = ['monthly', 'weekly', 'daily'].includes(category) ? now.getMonth() + 1 : undefined;
  const week = category === 'weekly' ? getWeekNumberInMonth(now) : undefined;
  const day = category === 'daily' ? now.getDate() : undefined;

  return {
    id: generateId(),
    title,
    category,
    template: 'block6',
    blocks: createInitialBlocks(),
    backlog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    year,
    month,
    week,
    day,
  };
};

export const useBlock6Store = create<Block6Store>()(
  persist(
    (set, get) => ({
      block6Plans: [],
      currentBlock6Id: null,

      get data() {
        const state = get();
        if (!state.currentBlock6Id) return null;
        return state.block6Plans.find((p) => p.id === state.currentBlock6Id) || null;
      },

      createBlock6Plan: (category: PlanCategory, title?: string) => {
        const newPlan = createInitialBlock6Plan(category, title || '');
        set((state) => ({
          block6Plans: [newPlan, ...state.block6Plans],
          currentBlock6Id: newPlan.id,
        }));
        return newPlan.id;
      },

      selectBlock6Plan: (id: string) => {
        set({ currentBlock6Id: id });
      },

      deleteBlock6Plan: (id: string) => {
        set((state) => {
          const newPlans = state.block6Plans.filter((p) => p.id !== id);
          const newCurrentId =
            state.currentBlock6Id === id ? newPlans[0]?.id || null : state.currentBlock6Id;
          return {
            block6Plans: newPlans,
            currentBlock6Id: newCurrentId,
          };
        });
      },

      getBlock6PlansByCategory: (category: PlanCategory) => {
        return get().block6Plans.filter((p) => p.category === category);
      },

      updateBlockKeyword: (blockId: string, keyword: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId ? { ...block, keyword: sanitizeInput(keyword) } : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateBlockColor: (blockId: string, color: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId ? { ...block, color } : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      addTodo: (blockId: string, text: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId || !text.trim()) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newTodo: TodoItem = {
            id: generateId(),
            text: sanitizeInput(text),
            completed: false,
            color: 'gray',
          };

          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId ? { ...block, todos: [...block.todos, newTodo] } : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateTodo: (blockId: string, todoId: string, text: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  todos: block.todos.map((todo) =>
                    todo.id === todoId ? { ...todo, text: sanitizeInput(text) } : todo
                  ),
                }
              : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      toggleTodo: (blockId: string, todoId: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  todos: block.todos.map((todo) =>
                    todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
                  ),
                }
              : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      deleteTodo: (blockId: string, todoId: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId
              ? { ...block, todos: block.todos.filter((todo) => todo.id !== todoId) }
              : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateTodoColor: (blockId: string, todoId: string, color: TodoColor) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  todos: block.todos.map((todo) =>
                    todo.id === todoId ? { ...todo, color } : todo
                  ),
                }
              : block
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      duplicateTodo: (blockId: string, todoId: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBlocks = plan.blocks.map((block) => {
            if (block.id !== blockId) return block;

            const originalTodo = block.todos.find((t) => t.id === todoId);
            if (!originalTodo) return block;

            const duplicatedTodo: TodoItem = {
              id: generateId(),
              text: originalTodo.text,
              completed: false,
              color: originalTodo.color,
            };

            const todoIndex = block.todos.findIndex((t) => t.id === todoId);
            const newTodos = [...block.todos];
            newTodos.splice(todoIndex + 1, 0, duplicatedTodo);

            return { ...block, todos: newTodos };
          });

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      // Backlog operations
      addBacklogTodo: (text: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId || !text.trim()) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newTodo: TodoItem = {
            id: generateId(),
            text: sanitizeInput(text),
            completed: false,
            color: 'gray',
          };

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: [...plan.backlog, newTodo],
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateBacklogTodo: (todoId: string, text: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBacklog = plan.backlog.map((todo) =>
            todo.id === todoId ? { ...todo, text: sanitizeInput(text) } : todo
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: newBacklog,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      toggleBacklogTodo: (todoId: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBacklog = plan.backlog.map((todo) =>
            todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: newBacklog,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      deleteBacklogTodo: (todoId: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBacklog = plan.backlog.filter((todo) => todo.id !== todoId);

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: newBacklog,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateBacklogTodoColor: (todoId: string, color: TodoColor) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBacklog = plan.backlog.map((todo) =>
            todo.id === todoId ? { ...todo, color } : todo
          );

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: newBacklog,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      duplicateBacklogTodo: (todoId: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const originalTodo = plan.backlog.find((t) => t.id === todoId);
          if (!originalTodo) return state;

          const duplicatedTodo: TodoItem = {
            id: generateId(),
            text: originalTodo.text,
            completed: false,
            color: originalTodo.color,
          };

          const todoIndex = plan.backlog.findIndex((t) => t.id === todoId);
          const newBacklog = [...plan.backlog];
          newBacklog.splice(todoIndex + 1, 0, duplicatedTodo);

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: newBacklog,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      reorderBlockTodo: (blockId: string, fromIndex: number, toIndex: number) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const blockIndex = plan.blocks.findIndex((b) => b.id === blockId);
          if (blockIndex === -1) return state;

          const block = plan.blocks[blockIndex];
          const newTodos = [...block.todos];
          const [moved] = newTodos.splice(fromIndex, 1);
          newTodos.splice(toIndex, 0, moved);

          const newBlocks = [...plan.blocks];
          newBlocks[blockIndex] = { ...block, todos: newTodos };

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = { ...plan, blocks: newBlocks, updatedAt: new Date().toISOString() };

          return { block6Plans: newPlans };
        });
      },

      reorderBacklogTodo: (fromIndex: number, toIndex: number) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          const newBacklog = [...plan.backlog];
          const [moved] = newBacklog.splice(fromIndex, 1);
          newBacklog.splice(toIndex, 0, moved);

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = { ...plan, backlog: newBacklog, updatedAt: new Date().toISOString() };

          return { block6Plans: newPlans };
        });
      },

      // Drag and drop: move todo between backlog and blocks
      moveTodo: (todoId, sourceType, sourceId, destType, destId) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const plan = state.block6Plans[planIndex];
          let todo: TodoItem | undefined;
          let newBacklog = [...plan.backlog];
          let newBlocks = [...plan.blocks];

          // Remove from source
          if (sourceType === 'backlog') {
            todo = newBacklog.find((t) => t.id === todoId);
            if (!todo) return state;
            newBacklog = newBacklog.filter((t) => t.id !== todoId);
          } else if (sourceType === 'block' && sourceId) {
            const sourceBlockIndex = newBlocks.findIndex((b) => b.id === sourceId);
            if (sourceBlockIndex === -1) return state;
            todo = newBlocks[sourceBlockIndex].todos.find((t) => t.id === todoId);
            if (!todo) return state;
            newBlocks[sourceBlockIndex] = {
              ...newBlocks[sourceBlockIndex],
              todos: newBlocks[sourceBlockIndex].todos.filter((t) => t.id !== todoId),
            };
          }

          if (!todo) return state;

          // Add to destination
          if (destType === 'backlog') {
            newBacklog.push(todo);
          } else if (destType === 'block' && destId) {
            const destBlockIndex = newBlocks.findIndex((b) => b.id === destId);
            if (destBlockIndex === -1) return state;
            newBlocks[destBlockIndex] = {
              ...newBlocks[destBlockIndex],
              todos: [...newBlocks[destBlockIndex].todos, todo],
            };
          }

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...plan,
            backlog: newBacklog,
            blocks: newBlocks,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateTitle: (title: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...newPlans[planIndex],
            title: sanitizeInput(title),
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updateCustomFocus: (focus: string) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...newPlans[planIndex],
            customFocus: sanitizeInput(focus),
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      updatePlanDate: (year?: number, month?: number, week?: number, day?: number) => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = {
            ...newPlans[planIndex],
            year,
            month,
            week,
            day,
            updatedAt: new Date().toISOString(),
          };

          return { block6Plans: newPlans };
        });
      },

      resetCurrent: () => {
        const currentId = get().currentBlock6Id;
        if (!currentId) return;

        set((state) => {
          const planIndex = state.block6Plans.findIndex((p) => p.id === currentId);
          if (planIndex === -1) return state;

          const oldPlan = state.block6Plans[planIndex];
          const newPlan = createInitialBlock6Plan(oldPlan.category, oldPlan.title);
          newPlan.id = oldPlan.id;

          const newPlans = [...state.block6Plans];
          newPlans[planIndex] = newPlan;

          return { block6Plans: newPlans };
        });
      },
    }),
    {
      name: BLOCK6_STORAGE_KEY,
      version: 2,
      skipHydration: true,
      partialize: (state) => ({
        block6Plans: state.block6Plans,
        currentBlock6Id: state.currentBlock6Id,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { block6Plans: Block6Data[]; currentBlock6Id: string | null };
        if (version < 2) {
          // Add backlog to existing plans
          return {
            ...state,
            block6Plans: state.block6Plans.map((plan) => ({
              ...plan,
              backlog: plan.backlog || [],
            })),
          };
        }
        return state;
      },
    }
  )
);

// Hydration hook for Next.js
export const useBlock6Hydration = () => {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useBlock6Store.persist.rehydrate();
    setHydrated(true);
  }, []);

  return hydrated;
};
