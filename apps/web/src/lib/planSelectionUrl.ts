import { TemplateType } from '@/types/mandalart';
import { TEMPLATE_TYPES } from '@/lib/templateRegistry';

/**
 * 주소창의 플랜 선택 정보. 템플릿과 플랜 ID만 담는다(제목·이메일·내용 금지).
 * 예: `/?template=daily&plan=1727000000000-abc1234`
 */
export const PLAN_URL_PARAMS = { template: 'template', plan: 'plan' } as const;

/** 서버 PlannerValidator의 ID 규칙과 같다. 다른 값은 조회하지 않고 잘못된 주소로 처리한다. */
const PLAN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export interface PlanSelection {
  template: TemplateType;
  id: string;
}

export type ParsedPlanSelection =
  | { kind: 'none' }
  | { kind: 'malformed' }
  | { kind: 'plan'; selection: PlanSelection };

export function parsePlanSelection(search: string): ParsedPlanSelection {
  const params = new URLSearchParams(search);
  const template = params.getAll(PLAN_URL_PARAMS.template);
  const id = params.getAll(PLAN_URL_PARAMS.plan);
  if (template.length === 0 && id.length === 0) return { kind: 'none' };
  if (template.length !== 1 || id.length !== 1) return { kind: 'malformed' };
  if (!TEMPLATE_TYPES.includes(template[0] as TemplateType) || !PLAN_ID_PATTERN.test(id[0])) return { kind: 'malformed' };
  return { kind: 'plan', selection: { template: template[0] as TemplateType, id: id[0] } };
}

/** 현재 주소에서 선택 정보만 바꾼 상대 URL. 다른 쿼리·해시는 그대로 둔다. */
export function planSelectionHref(location: Pick<Location, 'pathname' | 'search' | 'hash'>, selection: PlanSelection | null): string {
  const params = new URLSearchParams(location.search);
  params.delete(PLAN_URL_PARAMS.template);
  params.delete(PLAN_URL_PARAMS.plan);
  if (selection) {
    params.set(PLAN_URL_PARAMS.template, selection.template);
    params.set(PLAN_URL_PARAMS.plan, selection.id);
  }
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
}

export function sameSelection(a: PlanSelection | null, b: PlanSelection | null): boolean {
  return a === b || (!!a && !!b && a.template === b.template && a.id === b.id);
}
