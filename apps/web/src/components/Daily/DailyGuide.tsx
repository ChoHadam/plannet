'use client';

interface DailyGuideProps {
  onStart: () => void;
  onClose: () => void;
}

export function DailyGuide({ onStart, onClose }: DailyGuideProps) {
  return (
    <div
      className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">투두리스트</h2>
              <p className="text-sm text-slate-500">간단한 일간 할 일 관리</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-emerald-600 text-xs font-medium">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">할 일 추가</p>
                <p className="text-xs text-slate-500">오늘 해야 할 일을 입력하세요</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-emerald-600 text-xs font-medium">2</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">완료 체크</p>
                <p className="text-xs text-slate-500">완료한 일은 체크하여 진행률을 확인하세요</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-emerald-600 text-xs font-medium">3</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">날짜 이동</p>
                <p className="text-xs text-slate-500">좌우 화살표로 다른 날의 할 일도 관리할 수 있습니다</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">Tip:</span> 다른 플랜(월간, 주간, 만다라트)에서 할 일을 가져올 수도 있습니다.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl
                     bg-slate-100 text-slate-600
                     hover:bg-slate-200
                     transition-colors font-medium text-sm"
          >
            취소
          </button>
          <button
            onClick={onStart}
            className="flex-1 px-4 py-2.5 rounded-xl
                     bg-emerald-500 text-white
                     hover:bg-emerald-600
                     transition-colors font-medium text-sm"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
