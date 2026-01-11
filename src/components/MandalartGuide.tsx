'use client';

import { useState } from 'react';

interface MandalartGuideProps {
  onStart: () => void;
  onClose: () => void;
}

// Mini 9x9 grid for visual representation
function MiniGrid({
  highlightCenter = false,
  highlightSubGoals = false,
  highlightOuter = false,
  showExpansion = false,
}: {
  highlightCenter?: boolean;
  highlightSubGoals?: boolean;
  highlightOuter?: boolean;
  showExpansion?: boolean;
}) {
  const getGridColor = (gridIdx: number, cellIdx: number) => {
    const isCenter = gridIdx === 4;
    const isCenterCell = cellIdx === 4;

    if (highlightCenter && isCenter && isCenterCell) {
      return 'bg-amber-400';
    }
    if (highlightSubGoals && isCenter && !isCenterCell) {
      return 'bg-blue-400';
    }
    if (highlightOuter && !isCenter && isCenterCell) {
      return 'bg-blue-400';
    }
    if (showExpansion && !isCenter && !isCenterCell) {
      return 'bg-slate-300';
    }
    return 'bg-slate-200';
  };

  return (
    <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((gridIdx) => (
        <div key={gridIdx} className="grid grid-cols-3 gap-0.5 p-0.5 bg-slate-100 rounded">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cellIdx) => (
            <div
              key={cellIdx}
              className={`
                w-2 h-2 sm:w-3 sm:h-3 rounded-sm
                transition-colors duration-500
                ${getGridColor(gridIdx, cellIdx)}
              `}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Step 1: Introduction
function GuideStep1() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniGrid />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        만다라트란?
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        하나의 핵심 목표를 8개의 세부 목표로,<br />
        다시 64개의 실천 계획으로 확장하는<br />
        목표 달성 도구입니다.
      </p>
      <p className="text-xs text-slate-500 mt-4 bg-amber-50 rounded-lg py-2 px-3 inline-block">
        오타니 쇼헤이도 이 방법으로 MLB 스타가 되었어요!
      </p>
    </div>
  );
}

// Step 2: Center Goal
function GuideStep2() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniGrid highlightCenter highlightSubGoals />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        중심에 핵심 목표를
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        <span className="inline-block w-3 h-3 bg-amber-400 rounded-sm align-middle mr-1" />
        가운데에 이루고 싶은 큰 목표를 적고,<br />
        <span className="inline-block w-3 h-3 bg-blue-400 rounded-sm align-middle mr-1" />
        주변 8칸에 세부 목표를 작성합니다.
      </p>
    </div>
  );
}

// Step 3: Expansion
function GuideStep3() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniGrid highlightSubGoals highlightOuter showExpansion />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        세부 목표를 구체화
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        <span className="inline-block w-3 h-3 bg-blue-400 rounded-sm align-middle mr-1" />
        각 세부 목표가 외곽 그리드의 중심이 되어<br />
        <span className="inline-block w-3 h-3 bg-slate-300 rounded-sm align-middle mr-1" />
        8개의 구체적인 실천 계획으로 확장됩니다.
      </p>
    </div>
  );
}

// Step 4: Ready
function GuideStep4() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <MiniGrid />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3">
        준비 완료!
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">
        이제 나만의 만다라트를 만들어보세요.<br />
        중심부터 시작해서 차근차근 채워나가면<br />
        목표가 더 구체적으로 보일 거예요.
      </p>
    </div>
  );
}

const STEPS = [GuideStep1, GuideStep2, GuideStep3, GuideStep4];

export function MandalartGuide({ onStart, onClose }: MandalartGuideProps) {
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
  );
}
