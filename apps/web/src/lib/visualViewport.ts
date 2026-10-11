'use client';

import { useEffect } from 'react';

/** 화상 키보드가 가린 아래쪽 높이를 담는 CSS 변수 (globals.css `pb-keyboard`·`overlay-safe`) */
export const KEYBOARD_INSET_VAR = '--keyboard-inset';
// 이보다 작은 차이는 키보드가 아니다(가로 스크롤바·브라우저 도구 막대 접힘).
const KEYBOARD_MIN_PX = 80;

/**
 * 고정(fixed) 패널·모달은 화상 키보드가 열려도 레이아웃 뷰포트 기준이라 아래쪽 입력·버튼이 가려진다.
 * visualViewport의 resize/scroll 이벤트에서만 가려진 높이를 CSS 변수로 갱신한다(폴링 없음).
 * React 상태를 바꾸지 않으므로 입력 중인 요소가 다시 그려지거나 초안이 사라지지 않는다.
 * 손가락으로 확대한 동안은 키보드와 구분할 수 없어 0으로 둔다.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let current = -1;

    const update = () => {
      const zoomed = Math.abs(viewport.scale - 1) > 0.01;
      const gap = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      const hidden = zoomed || gap < KEYBOARD_MIN_PX ? 0 : gap;
      if (hidden === current) return;
      current = hidden;
      root.style.setProperty(KEYBOARD_INSET_VAR, `${hidden}px`);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty(KEYBOARD_INSET_VAR);
    };
  }, []);
}
