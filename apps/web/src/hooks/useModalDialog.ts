'use client';

import { KeyboardEvent, RefObject, useEffect, useRef } from 'react';
import { isImeComposing } from '@/lib/keyboard';

/** 모달 안에서 Tab 순환 대상이 되는 요소 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Tab으로 도달 가능한 요소: 명시적 tabIndex 음수, inert 영역, 화면에 없는 요소는 뺀다 */
export function getTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0);
}

/** 열린 useModalDialog 대화상자. 맨 위 것만 배경 초점을 되돌린다. */
const openDialogs: HTMLElement[] = [];

/** Tab/Shift+Tab이 container 밖으로 나가지 않게 처음↔끝을 잇는다. 처리했으면 true. */
export function trapTabKey(e: KeyboardEvent<HTMLElement>, container: HTMLElement): boolean {
  if (e.key !== 'Tab') return false;
  const focusables = getTabbables(container);
  if (focusables.length === 0) {
    e.preventDefault();
    return true;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && focusables.includes(active);
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

interface UseModalDialogOptions {
  onClose: () => void;
  /** 'first'(기본): 첫 조작 요소, 'dialog': 대화상자 자체(긴 안내문), ref: 지정 요소 */
  initialFocus?: 'first' | 'dialog' | RefObject<HTMLElement | null>;
}

/**
 * 모달 공통 키보드 동작 (W3C dialog-modal 패턴).
 * 열릴 때 초점 진입, Tab 순환, Esc 닫기, 닫힐 때 연 요소로 초점 복귀.
 * 열린 동안 배경으로 옮겨진 초점(스크립트·보조기기)은 대화상자로 되돌린다. 포인터는 각 모달의 배경막이 막는다.
 * 반환값을 대화상자 패널에 펼치고 aria-label 또는 aria-labelledby로 이름을 붙인다.
 */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>({
  onClose,
  initialFocus = 'first',
}: UseModalDialogOptions) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const initialFocusRef = useRef(initialFocus);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const option = initialFocusRef.current;
    const target = option === 'dialog'
      ? dialog
      : option === 'first'
        ? (dialog && getTabbables(dialog)[0]) ?? dialog
        : option.current ?? dialog;
    target?.focus();

    // 배경 DOM에 inert를 붙이면 React가 관리하는 inert(접힌 사이드바·보관함 suspended)와 충돌하므로 focusin으로 되돌린다.
    let lastInside: HTMLElement | null = target ?? null;
    const onFocusIn = (e: FocusEvent) => {
      if (!dialog || openDialogs[openDialogs.length - 1] !== dialog) return;
      if (e.target instanceof HTMLElement && dialog.contains(e.target)) {
        lastInside = e.target;
        return;
      }
      (lastInside?.isConnected ? lastInside : getTabbables(dialog)[0] ?? dialog).focus();
    };
    if (dialog) openDialogs.push(dialog);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      if (dialog) openDialogs.splice(openDialogs.indexOf(dialog), 1);
      // 연속 모달(템플릿 → 날짜 → 가이드)은 이 복귀 초점을 다음 모달이 다시 opener로 받는다.
      // 연 요소가 사라졌거나 inert 영역(닫힌 사이드바 등)에 있으면 되돌리지 않는다.
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<T>) => {
    if (e.key === 'Escape') {
      if (isImeComposing(e)) return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (dialogRef.current) trapTabKey(e, dialogRef.current);
  };

  return {
    dialogRef,
    dialogProps: {
      ref: dialogRef,
      role: 'dialog' as const,
      'aria-modal': true as const,
      tabIndex: -1,
      onKeyDown,
    },
  };
}
