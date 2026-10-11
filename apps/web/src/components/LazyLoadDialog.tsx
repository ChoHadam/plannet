'use client';

import { useRef } from 'react';
import { useModalDialog } from '@/hooks/useModalDialog';
import { FOCUS_RING } from '@/lib/constants';

interface LazyLoadDialogProps {
  title: string;
  /** 있으면 실패 상태: 안내와 `다시 시도`를 보인다 */
  onRetry?: () => void;
  onClose: () => void;
}

const BUTTON = `flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${FOCUS_RING}`;

/**
 * 처음 여는 대화상자·패널의 코드를 받는 동안·실패했을 때의 자리. 언제든 닫을 수 있고 실패하면 새로고침 없이 다시 시도한다.
 * 닫으면 지연 로딩도 그 자리에서 끝나므로 늦게 도착한 코드가 닫힌 창을 다시 열지 않는다.
 */
export function LazyLoadDialog({ title, onRetry, onClose }: LazyLoadDialogProps) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  const closeRef = useRef<HTMLButtonElement>(null);
  const retry = () => {
    // 다시 시도 버튼이 사라져도 초점이 대화상자 안에 남게 한다.
    (closeRef.current ?? dialogRef.current)?.focus();
    onRetry?.();
  };
  return (
    <div className="fixed inset-0 overlay-safe bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div
        {...dialogProps}
        aria-label={title}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 max-h-full overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <div role="status" className="text-sm text-slate-600 space-y-1">
          {onRetry ? (
            <>
              <p>화면을 불러오지 못했어요.</p>
              <p className="text-xs text-slate-500">연결을 확인하고 다시 시도해주세요. 계속 실패하면 저장이 끝난 뒤 새로고침해주세요.</p>
            </>
          ) : (
            <p>불러오는 중...</p>
          )}
        </div>
        <div className="flex gap-3">
          <button ref={closeRef} onClick={onClose} className={`${BUTTON} bg-slate-100 text-slate-600 hover:bg-slate-200`}>
            닫기
          </button>
          {onRetry && (
            <button onClick={retry} className={`${BUTTON} bg-indigo-500 text-white hover:bg-indigo-600`}>
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
