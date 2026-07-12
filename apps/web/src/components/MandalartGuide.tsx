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
      <p className="text-xs text-slate-500 mt-4 bg-slate-100 rounded-lg py-2 px-3 inline-block">
        예시: &quot;역량향상&quot; → 전문성, 외국어, 건강 등 8가지 세부 목표
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

// Example data for the filled grid
const EXAMPLE_DATA = {
  centerGoal: '역량향상',
  subGoals: ['전문성', '데이터', '외국어', '생산성', '소통', '리더십', '트렌드', '건강'],
  // "외국어" 확장 (index 2 in subGoals, which maps to grid index 5)
  expandedGoal: '외국어',
  expandedActions: ['단어5개', '전화영어', '팟캐스트', '학습지', '미드시청', '원서읽기', '회화모임', '듀오링고'],
  expandedGridIdx: 5, // middle right position
};

// Grid position mapping: subGoal index -> grid index
const SUB_GOAL_TO_GRID: Record<number, number> = {
  0: 1, // 전문성 -> top center
  1: 2, // 데이터 -> top right
  2: 5, // 외국어 -> middle right (will be highlighted)
  3: 8, // 생산성 -> bottom right
  4: 7, // 소통 -> bottom center
  5: 6, // 리더십 -> bottom left
  6: 3, // 트렌드 -> middle left
  7: 0, // 건강 -> top left
};

// Cell position mapping: action index -> cell index (excluding center which is 4)
const ACTION_TO_CELL: Record<number, number> = {
  0: 1, 1: 2, 2: 5, 3: 8, 4: 7, 5: 6, 6: 3, 7: 0,
};

// Example Grid with text
function ExampleGrid() {
  const getCellContent = (gridIdx: number, cellIdx: number) => {
    // Center grid (index 4)
    if (gridIdx === 4) {
      if (cellIdx === 4) {
        return { text: EXAMPLE_DATA.centerGoal, isCenter: true };
      }
      const subGoalIdx = Object.entries(SUB_GOAL_TO_GRID).find(([, gridPosition]) => gridPosition === cellIdx)?.[0];
      if (subGoalIdx !== undefined) {
        return {
          text: EXAMPLE_DATA.subGoals[parseInt(subGoalIdx)],
          isSubGoal: true,
          isHighlighted: EXAMPLE_DATA.subGoals[parseInt(subGoalIdx)] === EXAMPLE_DATA.expandedGoal,
        };
      }
      return null;
    }

    // Expanded grid (외국어)
    if (gridIdx === EXAMPLE_DATA.expandedGridIdx) {
      if (cellIdx === 4) {
        return { text: EXAMPLE_DATA.expandedGoal, isSubGoal: true, isHighlighted: true };
      }
      const actionIdx = Object.entries(ACTION_TO_CELL).find(([, c]) => c === cellIdx)?.[0];
      if (actionIdx !== undefined) {
        return { text: EXAMPLE_DATA.expandedActions[parseInt(actionIdx)], isAction: true };
      }
    }

    return null;
  };

  const getCellStyle = (gridIdx: number, cellIdx: number) => {
    const content = getCellContent(gridIdx, cellIdx);
    if (!content) return 'bg-slate-100';
    if (content.isCenter) return 'bg-amber-400';
    if (content.isHighlighted) return 'bg-blue-400';
    if (content.isSubGoal) return 'bg-blue-300';
    if (content.isAction) return 'bg-emerald-200';
    return 'bg-slate-200';
  };

  return (
    <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((gridIdx) => (
        <div
          key={gridIdx}
          className={`
            grid grid-cols-3 gap-0.5 p-0.5 rounded
            ${gridIdx === 4 || gridIdx === EXAMPLE_DATA.expandedGridIdx ? 'bg-slate-200' : 'bg-slate-100'}
          `}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cellIdx) => {
            const content = getCellContent(gridIdx, cellIdx);
            return (
              <div
                key={cellIdx}
                className={`
                  w-7 h-7 sm:w-8 sm:h-8 rounded-sm
                  flex items-center justify-center
                  transition-colors duration-300
                  ${getCellStyle(gridIdx, cellIdx)}
                `}
              >
                {content && (
                  <span className={`
                    text-[6px] sm:text-[7px] font-medium text-center leading-tight
                    ${content.isCenter ? 'text-amber-900' : ''}
                    ${content.isSubGoal ? 'text-blue-900' : ''}
                    ${content.isAction ? 'text-emerald-900' : ''}
                  `}>
                    {content.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Step 4: Example
function GuideStep4() {
  return (
    <div className="text-center">
      <div className="mb-4">
        <ExampleGrid />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">
        작성 예시
      </h3>
      <p className="text-xs text-slate-600 leading-relaxed">
        <span className="inline-block w-2.5 h-2.5 bg-amber-400 rounded-sm align-middle mr-1" />
        핵심 목표 →
        <span className="inline-block w-2.5 h-2.5 bg-blue-400 rounded-sm align-middle mx-1" />
        세부 목표 →
        <span className="inline-block w-2.5 h-2.5 bg-emerald-200 rounded-sm align-middle mx-1" />
        실천 계획
      </p>
    </div>
  );
}

// Step 5: Ready
function GuideStep5() {
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
      <p className="text-xs text-slate-500 mt-4 bg-slate-100 rounded-lg py-2 px-3 inline-block">
        💡 다 못 채워도 괜찮아요! 빈 칸은 이모지로 꾸며보세요
      </p>
    </div>
  );
}

const STEPS = [GuideStep1, GuideStep2, GuideStep3, GuideStep4, GuideStep5];

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
