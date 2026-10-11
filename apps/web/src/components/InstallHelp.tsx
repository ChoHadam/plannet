'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '@/hooks/useModalDialog';
import { FOCUS_RING } from '@/lib/constants';

const STANDALONE_QUERY = '(display-mode: standalone)';

function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** 홈 화면 앱으로 열렸는가 (iOS Safari는 navigator.standalone) */
function isStandalone() {
  return window.matchMedia(STANDALONE_QUERY).matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * 사이드바 하단의 `홈 화면에 추가` 안내. 이미 홈 화면 앱으로 열렸으면 보이지 않는다.
 * 자동으로 띄우지 않고, 본 적 있는지도 저장하지 않는다(LocalStorage 없음).
 */
export function InstallHelpButton() {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const [open, setOpen] = useState(false);
  if (standalone) return null;

  return (
    <div className="p-3 border-t border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 touch:min-h-11 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors ${FOCUS_RING}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
        홈 화면에 추가
      </button>
      {/* 사이드바(이동 transform)는 fixed 자식의 기준이 되므로 대화상자는 body에 그린다 */}
      {open && createPortal(<InstallHelpDialog onClose={() => setOpen(false)} />, document.body)}
    </div>
  );
}

function InstallHelpDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const { dialogProps } = useModalDialog({ onClose });

  return (
    <div className="fixed inset-0 overlay-safe bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div
        {...dialogProps}
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 max-h-full overflow-y-auto animate-in outline-none"
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-800">홈 화면에 추가</h3>
        <dl className="mt-4 space-y-3 text-sm text-slate-600">
          <div>
            <dt className="font-medium text-slate-800">iPhone · iPad (Safari)</dt>
            <dd className="mt-0.5">공유 버튼 → <strong className="font-medium">홈 화면에 추가</strong> → 추가</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-800">Android (Chrome)</dt>
            <dd className="mt-0.5">⋮ 메뉴 → <strong className="font-medium">홈 화면에 추가</strong> 또는 <strong className="font-medium">앱 설치</strong></dd>
          </div>
        </dl>
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          홈 화면의 Plannet은 이 사이트를 앱 창으로 여는 바로가기예요. 인터넷 연결이 필요하고 기록은 지금처럼 계정 서버에 저장돼요.
          앱을 닫거나 다른 앱으로 넘어가기 전에 위쪽 저장 상태가 &lsquo;서버에 저장됐어요&rsquo;인지 확인해주세요.
        </p>
        <button
          type="button"
          onClick={onClose}
          className={`mt-4 w-full min-h-11 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 ${FOCUS_RING}`}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
