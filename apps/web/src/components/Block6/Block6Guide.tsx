'use client';

interface Block6GuideProps {
  onStart: () => void;
  onClose: () => void;
}

export function Block6Guide({ onStart, onClose }: Block6GuideProps) {
  return (
    <div
      className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Block 6 시간 관리법
        </h2>

        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Block 6는 하루를 <strong>6개의 시간 블록</strong>으로 나누어 관리하는 방식입니다.
            분 단위 시간 관리가 아닌, <strong>&quot;무엇을&quot;</strong> 중심의 유연한 시간 관리를 지향합니다.
          </p>

          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-700 mb-2">시간대 구분</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200" />
                <span><strong>오전</strong> (Block 1-2): 기상 ~ 점심 전</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200" />
                <span><strong>오후</strong> (Block 3-4): 점심 ~ 저녁 전</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-violet-100 border border-violet-200" />
                <span><strong>저녁</strong> (Block 5-6): 저녁식사 ~ 취침 전</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-700 mb-2">사용 방법</h3>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>각 블록에 <strong>메인 키워드</strong>를 정합니다 (예: 운동, 업무, 공부)</li>
              <li>키워드 아래에 <strong>투두리스트</strong>를 추가합니다</li>
              <li>시간은 유연하게, <strong>무엇을 할지</strong>에 집중합니다</li>
              <li>완료한 항목은 체크하여 진행률을 확인합니다</li>
            </ol>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <h3 className="font-semibold text-amber-800 mb-1">핵심 포인트</h3>
            <p className="text-amber-700">
              &quot;몇 시에&quot;보다 <strong>&quot;무엇을&quot;</strong>에 집중하세요.
              공간화된 시간 제약으로 우선순위 판단이 명확해지고,
              루틴이 깨지지 않으면서도 새로운 활동을 수용할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="
              flex-1 px-4 py-2.5 rounded-lg
              bg-slate-100 text-slate-600
              hover:bg-slate-200
              transition-colors font-medium
            "
          >
            닫기
          </button>
          <button
            onClick={onStart}
            className="
              flex-1 px-4 py-2.5 rounded-lg
              bg-slate-800 text-white
              hover:bg-slate-900
              transition-colors font-medium
            "
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
