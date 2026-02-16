'use client';

import { useState } from 'react';

interface MonthlyGuideProps {
  onStart: () => void;
  onClose: () => void;
}

// Mini calendar visual
function MiniCalendar({ highlightGoals = false, highlightWeeks = false }: { highlightGoals?: boolean; highlightWeeks?: boolean }) {
  return (
    <div className="flex gap-4 justify-center">
      {/* Calendar side */}
      <div className="bg-slate-100 rounded-lg p-2">
        <div className="grid grid-cols-7 gap-0.5 text-[8px] text-slate-400 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <span key={d} className="w-4 text-center">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 35 }, (_, i) => {
            const day = i - 3; // Start from -3 for previous month days
            const isValidDay = day > 0 && day <= 28;
            const isToday = day === 15;
            const hasEvent = [5, 12, 20, 25].includes(day);
            return (
              <div
                key={i}
                className={`
                  w-4 h-4 rounded text-[8px] flex items-center justify-center
                  ${!isValidDay ? 'text-slate-300' : 'text-slate-600'}
                  ${isToday ? 'bg-red-100 ring-1 ring-red-400' : ''}
                  ${hasEvent && isValidDay ? 'relative' : ''}
                `}
              >
                {isValidDay ? day : ''}
                {hasEvent && isValidDay && (
                  <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-amber-400" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dashboard side */}
      <div className="flex flex-col gap-2">
        {/* Goals */}
        <div className={`bg-slate-100 rounded-lg p-2 transition-all ${highlightGoals ? 'ring-2 ring-blue-400' : ''}`}>
          <div className="text-[8px] text-slate-500 mb-1">목표</div>
          <div className="space-y-1">
            {[60, 30, 10].map((progress, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm border border-slate-300" />
                <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weeks */}
        <div className={`bg-slate-100 rounded-lg p-2 transition-all ${highlightWeeks ? 'ring-2 ring-emerald-400' : ''}`}>
          <div className="text-[8px] text-slate-500 mb-1">주간</div>
          <div className="space-y-0.5">
            {['W1', 'W2', 'W3', 'W4'].map((w) => (
              <div key={w} className="flex items-center gap-1">
                <span className="text-[7px] text-slate-400 w-4">{w}</span>
                <div className="w-10 h-1.5 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 1: Introduction
function GuideStep1() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniCalendar />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        월간 나침반
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        한 달의 방향을 설정하고<br />
        목표와 주간 계획을 관리하는<br />
        전략적 대시보드입니다.
      </p>
      <p className="text-xs text-slate-500 mt-4 bg-slate-100 rounded-lg py-2 px-3 inline-block">
        만다라트(Why) → 월간(What) → Block6(How)
      </p>
    </div>
  );
}

// Step 2: Goals
function GuideStep2() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniCalendar highlightGoals />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        이달의 목표 설정
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        3~5개의 핵심 목표를 설정하고<br />
        진행률을 트래킹하세요.<br />
        드래그로 진행률을 조절할 수 있어요.
      </p>
    </div>
  );
}

// Step 3: Weekly Focus
function GuideStep3() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniCalendar highlightWeeks />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        주간 포커스
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        각 주에 집중할 핵심 과업을<br />
        미리 계획하세요.<br />
        Block6 플래너의 가이드가 됩니다.
      </p>
    </div>
  );
}

// Step 4: Calendar
function GuideStep4() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniCalendar />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        이벤트 & 마감일
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        캘린더에서 날짜를 클릭하여<br />
        중요한 이벤트나 마감일을<br />
        기록하세요.
      </p>
      <p className="text-xs text-slate-500 mt-4 bg-slate-100 rounded-lg py-2 px-3 inline-block">
        이벤트가 있는 날짜는 점으로 표시됩니다
      </p>
    </div>
  );
}

// Step 5: Ready
function GuideStep5() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniCalendar />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        준비 완료!
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        이제 이번 달의 방향을 설정해보세요.<br />
        목표를 세우고, 주간 계획을 작성하면<br />
        한 달이 더 뚜렷해질 거예요.
      </p>
    </div>
  );
}

const STEPS = [GuideStep1, GuideStep2, GuideStep3, GuideStep4, GuideStep5];

export function MonthlyGuide({ onStart, onClose }: MonthlyGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const StepComponent = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          {/* Step indicators */}
          <div className="flex gap-1.5">
            {STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`
                  w-2 h-2 rounded-full transition-colors
                  ${idx === currentStep ? 'bg-slate-700' : 'bg-slate-300 hover:bg-slate-400'}
                `}
              />
            ))}
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[280px] flex items-center justify-center">
          <StepComponent />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${currentStep === 0
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-600 hover:bg-slate-100'}
            `}
          >
            이전
          </button>

          <div className="flex items-center gap-2">
            {/* Skip button - only on first step */}
            {currentStep === 0 && (
              <button
                onClick={onStart}
                className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                스킵하기
              </button>
            )}

            {isLastStep ? (
              <button
                onClick={onStart}
                className="px-6 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors"
              >
                시작하기
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors"
              >
                다음
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
