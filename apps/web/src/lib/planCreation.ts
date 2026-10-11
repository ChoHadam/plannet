'use client';

import { PlanCategory, TemplateType } from '@/types/mandalart';
import { getAllTitles, templateRegistry, TEMPLATE_TYPES } from '@/lib/templateRegistry';

export interface PlanDate {
  year?: number;
  month?: number;
  week?: number;
  day?: number;
}

export function generateDefaultTitle(category: PlanCategory, date: PlanDate, existingTitles: string[]): string {
  const now = new Date();
  const y = date.year ?? now.getFullYear();
  const m = date.month ?? now.getMonth() + 1;
  const mm = String(m).padStart(2, '0');

  let base: string;
  switch (category) {
    case 'annual':
      base = `${y}`;
      break;
    case 'monthly':
      base = `${y}.${mm}`;
      break;
    case 'weekly': {
      const w = date.week ?? 1;
      base = `${y}.${mm} W${w}`;
      break;
    }
    case 'daily': {
      const d = date.day ?? now.getDate();
      const dd = String(d).padStart(2, '0');
      base = `${y}.${mm}.${dd}`;
      break;
    }
  }

  if (!existingTitles.includes(base)) return base;

  let n = 2;
  while (existingTitles.includes(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** 명시적 생성 동작에서만 호출한다. 다른 템플릿 선택을 해제하고 기본 제목·날짜로 새 플랜을 만들어 선택한다. */
export function createPlanWithDefaults(template: TemplateType, category: PlanCategory, date: PlanDate): void {
  for (const t of TEMPLATE_TYPES) {
    if (t !== template) templateRegistry[t].clearSelection();
  }
  const entry = templateRegistry[template];
  entry.create(category, date);
  entry.applyTitleAndDate(generateDefaultTitle(category, date, getAllTitles()), date);
}
