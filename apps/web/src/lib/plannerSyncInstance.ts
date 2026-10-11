import type { PlannerSync } from '@/lib/plannerSync';

// The active sync lives here without store imports, so AuthProvider (landing) does not load the planner stores.
let coordinator: PlannerSync | null = null;

export function getPlannerSync(): PlannerSync | null { return coordinator; }
export function setPlannerSync(instance: PlannerSync | null): void { coordinator = instance; }
