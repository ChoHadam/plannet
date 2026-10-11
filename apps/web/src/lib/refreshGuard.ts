import type { RefreshHold, RefreshImpact } from '@/lib/plannerSync';

/**
 * 다른 기기 변경을 반영하면 안 되는 순간(편집 초점·조합·모달·`data-refresh-hold`·최근 입력·AI 대화, 보던 플랜이 사라질 때 `data-local-draft`의 미추가 글자).
 * store에 아직 반영되지 않은 입력을 지키기 위한 것이다.
 */
/** 컴포넌트가 입력을 store에 늦게 반영하는 시간(월간 메모 500ms)보다 길게 */
export const LOCAL_INPUT_SETTLE_MS = 1_000;
export const LOCAL_DRAFT_ATTRIBUTE = 'data-local-draft';
const HOLD_SELECTOR = '[role="dialog"][aria-modal="true"], [data-refresh-hold]';
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date', 'datetime-local', 'month', 'week', 'time']);

const explicitHolds = new Map<symbol, RefreshHold>();
const releaseListeners = new Set<() => void>();
let activity = 0;
let lastInputAt = 0;

function isEditable(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type) && !element.readOnly && !element.disabled;
  return element instanceof HTMLElement && element.isContentEditable;
}

function notifyIfReleased(): void {
  if (readRefreshHold() === null) releaseListeners.forEach((listener) => listener());
}

/** 명시적 보류. 돌려받은 함수로 해제한다(해제 시 미뤘던 확인을 다시 시도). */
export function holdRefresh(reason: RefreshHold): () => void {
  const key = Symbol(reason);
  explicitHolds.set(key, reason);
  return () => {
    if (explicitHolds.delete(key)) setTimeout(notifyIfReleased, 0);
  };
}

export function readRefreshHold(impact?: RefreshImpact): RefreshHold | null {
  const explicit = explicitHolds.values().next();
  if (!explicit.done) return explicit.value;
  if (typeof document === 'undefined') return null;
  if (isEditable(document.activeElement) || document.querySelector(HOLD_SELECTOR)) return 'editing';
  if (Date.now() - lastInputAt < LOCAL_INPUT_SETTLE_MS) return 'editing';
  if (impact?.selectionRemoved) {
    const drafts = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`input[${LOCAL_DRAFT_ATTRIBUTE}], textarea[${LOCAL_DRAFT_ATTRIBUTE}]`);
    if ([...drafts].some((field) => field.value.trim())) return 'draft';
  }
  return null;
}

/** 사용자 입력 횟수. 조회 중에 바뀌면 그 응답을 적용하지 않는다. */
export function readInputActivity(): number {
  return activity;
}

/** 문서 입력·초점 이동을 관찰한다. 보류가 풀리면 onRelease를 부른다(초점 이탈 뒤 commit이 먼저 끝나도록 한 틱 뒤). */
export function installRefreshGuard(onRelease: () => void): () => void {
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const onInput = () => {
    activity++;
    lastInputAt = Date.now();
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(notifyIfReleased, LOCAL_INPUT_SETTLE_MS);
  };
  const onFocusMove = () => { setTimeout(notifyIfReleased, 0); };
  const events = ['input', 'compositionstart', 'compositionupdate', 'compositionend'] as const;
  events.forEach((type) => document.addEventListener(type, onInput, true));
  document.addEventListener('focusout', onFocusMove, true);
  document.addEventListener('focusin', onFocusMove, true);
  releaseListeners.add(onRelease);
  return () => {
    events.forEach((type) => document.removeEventListener(type, onInput, true));
    document.removeEventListener('focusout', onFocusMove, true);
    document.removeEventListener('focusin', onFocusMove, true);
    releaseListeners.delete(onRelease);
    if (settleTimer) clearTimeout(settleTimer);
  };
}
