/** Cell IDs are only unique inside a Mandalart, so provenance is always a pair. */
export function monthlySourceKey(sourceMandalartId: string, cellId: string): string {
  return JSON.stringify([sourceMandalartId, cellId]);
}

export interface MonthlyImportItem {
  text: string;
  cellId: string;
  sourceMandalartId?: string;
}

export const MONTHLY_IMPORT_GOAL_LIMIT = 5;
