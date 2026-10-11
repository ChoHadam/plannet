'use client';

import { ReactNode, useId, useRef } from 'react';
import { useModalDialog } from '@/hooks/useModalDialog';
import { FOCUS_RING } from '@/lib/constants';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** 되돌릴 수 없는 동작은 빨간 확인 버튼 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 되돌리기 어려운 동작의 확인 창. 첫 초점·Esc·배경 클릭은 모두 취소 쪽이라 Enter 한 번으로 실행되지 않는다.
 * 열린 동안 내용이 바뀌지 않게 aria-modal과 data-refresh-hold로 다른 기기 최신화를 미룬다.
 */
export function ConfirmDialog({ title, children, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { dialogProps } = useModalDialog({ onClose: onCancel, initialFocus: cancelRef });
  const confirmColor = danger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600';

  return (
    <div className="fixed inset-0 overlay-safe bg-black/20 flex items-center justify-center z-50" onClick={onCancel} data-refresh-hold>
      <div
        {...dialogProps}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 max-h-full overflow-y-auto animate-in outline-none"
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
        <div id={descriptionId} className="text-sm text-slate-500 mb-6 space-y-1">{children}</div>
        <div className="flex gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`flex-1 min-h-10 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors duration-200 font-medium ${FOCUS_RING}`}>취소</button>
          <button type="button" onClick={onConfirm} className={`flex-1 min-h-10 px-4 py-2 rounded-lg text-white transition-colors duration-200 font-medium ${confirmColor} ${FOCUS_RING}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
