import type { KeyboardEvent } from 'react';

/** 한글 등 IME 조합 중 키 입력인지. 조합 확정 Enter가 제출·편집 종료로 처리되지 않게 먼저 거른다. */
export function isImeComposing(e: KeyboardEvent): boolean {
  // Safari 등 일부 브라우저는 isComposing 없이 keyCode 229만 보낸다.
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
