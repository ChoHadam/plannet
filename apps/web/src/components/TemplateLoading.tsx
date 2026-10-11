import { FOCUS_RING } from '@/lib/constants';

/** 편집기 코드를 받는 동안의 자리 표시. 실패하면 새로고침 없이 다시 받는다(수정 중인 내용 보호). */
export function TemplateLoading({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="status" className="py-16 text-center text-xs text-slate-400">
      {onRetry ? (
        <div className="flex flex-col items-center gap-3">
          <p>편집 화면을 불러오지 못했어요. 계속 실패하면 저장이 끝난 뒤 새로고침해주세요.</p>
          <button
            onClick={onRetry}
            className={`px-4 py-2 rounded-lg bg-slate-100 text-sm font-medium text-slate-600 hover:bg-slate-200 ${FOCUS_RING}`}
          >
            다시 시도
          </button>
        </div>
      ) : '편집 화면을 불러오는 중...'}
    </div>
  );
}
