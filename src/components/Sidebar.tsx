'use client';

import { useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import { useMonthlyStore } from '@/hooks/useMonthly';
import {
  PlanCategory,
  PLAN_CATEGORY_LABELS,
  TemplateType,
  TEMPLATE_LABELS,
  MandalartData,
} from '@/types/mandalart';
import { Block6Data } from '@/types/block6';
import { MonthlyData } from '@/types/monthly';
import { DatePicker, formatPlanDate } from './DatePicker';
import { MandalartGuide } from './MandalartGuide';
import { Block6Guide } from './Block6';
import { MonthlyGuide } from './Monthly';

// Union type for all plan types
type PlanData = MandalartData | Block6Data | MonthlyData;

const PLAN_CATEGORIES: PlanCategory[] = ['annual', 'monthly', 'weekly', 'daily'];

interface SectionProps {
  category: PlanCategory;
  plans: PlanData[];
  currentId: string | null;
  currentTemplate: TemplateType | null;
  onSelect: (id: string, template: TemplateType) => void;
  onCreateClick: () => void;
  onDelete: (id: string, template: TemplateType) => void;
}

function Section({ category, plans, currentId, currentTemplate, onSelect, onCreateClick, onDelete }: SectionProps) {
  const recentPlans = plans
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-2">
        <h3 className="text-sm font-semibold text-slate-600">
          {PLAN_CATEGORY_LABELS[category]}
        </h3>
        <button
          onClick={onCreateClick}
          className="
            w-6 h-6 rounded flex items-center justify-center
            text-slate-400 transition-colors
            hover:bg-slate-100 hover:text-slate-600
          "
          title="새로 만들기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      <div className="space-y-1">
        {recentPlans.length === 0 ? (
          <p className="text-xs text-slate-400 px-2 py-2">
            플랜이 없습니다
          </p>
        ) : (
          recentPlans.map((plan) => {
            const isSelected = currentId === plan.id && currentTemplate === plan.template;
            return (
              <div
                key={plan.id}
                className={`
                  group flex items-center justify-between
                  px-2 py-1.5 rounded-lg cursor-pointer
                  transition-colors
                  ${isSelected
                    ? 'bg-slate-200 text-slate-800'
                    : 'hover:bg-slate-100 text-slate-600'}
                `}
                onClick={() => onSelect(plan.id, plan.template)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate">
                      {plan.title || '제목 없음'}
                    </span>
                    <span className={`
                      flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full
                      ${plan.template === 'block6'
                        ? 'bg-violet-100 text-violet-600'
                        : plan.template === 'monthly'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-amber-100 text-amber-600'}
                    `}>
                      {TEMPLATE_LABELS[plan.template]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {/* 월간 템플릿은 항상 년+월 표시 */}
                    {plan.template === 'monthly'
                      ? formatPlanDate('monthly', plan.year, plan.month, undefined, undefined, true)
                      : formatPlanDate(plan.category, plan.year, plan.month, 'week' in plan ? plan.week : undefined, 'day' in plan ? plan.day : undefined, true)
                    }
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(plan.id, plan.template);
                  }}
                  className="
                    opacity-0 group-hover:opacity-100
                    w-5 h-5 rounded flex items-center justify-center
                    text-slate-400 hover:text-red-500 hover:bg-red-50
                    transition-all ml-1
                  "
                  title="삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface TemplateModalProps {
  category: PlanCategory;
  onSelect: (template: TemplateType) => void;
  onClose: () => void;
  onShowGuide: (template: TemplateType) => void;
}

function TemplateModal({ category, onSelect, onClose, onShowGuide }: TemplateModalProps) {
  const templates: { type: TemplateType; description: string; hasGuide?: boolean }[] = [
    { type: 'mandalart', description: '9x9 그리드로 목표를 세분화', hasGuide: true },
    { type: 'block6', description: '하루 6블록 시간 관리', hasGuide: true },
    { type: 'monthly', description: '월간 목표와 주간 계획', hasGuide: true },
  ];

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-800 mb-2">
          {PLAN_CATEGORY_LABELS[category]} 만들기
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          템플릿을 선택하세요
        </p>

        <div className="space-y-2">
          {templates.map((template) => (
            <div key={template.type} className="flex items-stretch gap-2">
              <button
                onClick={() => onSelect(template.type)}
                className="
                  flex-1 p-3 rounded-lg border border-slate-200
                  text-left hover:border-slate-400 hover:bg-slate-50
                  transition-colors
                "
              >
                <div className="font-medium text-slate-700">
                  {TEMPLATE_LABELS[template.type]}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {template.description}
                </div>
              </button>
              {template.hasGuide && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowGuide(template.type);
                  }}
                  className="
                    w-10 rounded-lg border border-slate-200
                    flex items-center justify-center
                    text-slate-400 hover:text-slate-600
                    hover:border-slate-400 hover:bg-slate-50
                    transition-colors
                  "
                  title={`${TEMPLATE_LABELS[template.type]} 사용법`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="
            w-full mt-4 px-4 py-2 rounded-lg
            bg-slate-100 text-slate-600
            hover:bg-slate-200
            transition-colors font-medium
          "
        >
          취소
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  // Mandalart store
  const mandalarts = useMandalartStore((state) => state.mandalarts);
  const currentMandalartId = useMandalartStore((state) => state.currentId);
  const createMandalart = useMandalartStore((state) => state.createMandalart);
  const selectMandalart = useMandalartStore((state) => state.selectMandalart);
  const deleteMandalart = useMandalartStore((state) => state.deleteMandalart);

  // Block6 store
  const block6Plans = useBlock6Store((state) => state.block6Plans);
  const currentBlock6Id = useBlock6Store((state) => state.currentBlock6Id);
  const createBlock6Plan = useBlock6Store((state) => state.createBlock6Plan);
  const selectBlock6Plan = useBlock6Store((state) => state.selectBlock6Plan);
  const deleteBlock6Plan = useBlock6Store((state) => state.deleteBlock6Plan);

  // Monthly store
  const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);
  const currentMonthlyId = useMonthlyStore((state) => state.currentMonthlyId);
  const createMonthlyPlan = useMonthlyStore((state) => state.createMonthlyPlan);
  const selectMonthlyPlan = useMonthlyStore((state) => state.selectMonthlyPlan);
  const deleteMonthlyPlan = useMonthlyStore((state) => state.deleteMonthlyPlan);

  const [createCategory, setCreateCategory] = useState<PlanCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ plan: PlanData; template: TemplateType } | null>(null);
  const [showMandalartGuide, setShowMandalartGuide] = useState(false);
  const [showBlock6Guide, setShowBlock6Guide] = useState(false);
  const [showMonthlyGuide, setShowMonthlyGuide] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateType | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDate, setPendingDate] = useState<{
    year?: number;
    month?: number;
    week?: number;
    day?: number;
  }>({});

  // Determine current template based on which store has a selection
  const currentTemplate: TemplateType | null = currentMandalartId ? 'mandalart' : currentBlock6Id ? 'block6' : currentMonthlyId ? 'monthly' : null;
  const currentId = currentMandalartId || currentBlock6Id || currentMonthlyId;

  const getPlansByCategory = (category: PlanCategory): PlanData[] => {
    const mandalartPlans = mandalarts.filter((m) => m.category === category);
    const block6CategoryPlans = block6Plans.filter((p) => p.category === category);
    const monthlyCategoryPlans = monthlyPlans.filter((p) => p.category === category);
    return [...mandalartPlans, ...block6CategoryPlans, ...monthlyCategoryPlans];
  };

  const handleCreateClick = (category: PlanCategory) => {
    setCreateCategory(category);
  };

  const handleTemplateSelect = (template: TemplateType) => {
    setPendingTemplate(template);
    // 먼저 날짜 선택 모달 표시
    setShowDatePicker(true);
  };

  const handleDateSelect = (year?: number, month?: number, week?: number, day?: number) => {
    setPendingDate({ year, month, week, day });
    setShowDatePicker(false);
    // 날짜 선택 후 가이드 모달 표시
    if (pendingTemplate === 'mandalart') {
      setShowMandalartGuide(true);
    } else if (pendingTemplate === 'block6') {
      setShowBlock6Guide(true);
    } else if (pendingTemplate === 'monthly') {
      setShowMonthlyGuide(true);
    }
  };

  const handleDatePickerClose = () => {
    setShowDatePicker(false);
    // 취소 시 템플릿 선택 모달로 돌아감
  };

  const handleSelect = (id: string, template: TemplateType) => {
    // Clear all other selections
    if (template === 'mandalart') {
      if (currentBlock6Id) useBlock6Store.setState({ currentBlock6Id: null });
      if (currentMonthlyId) useMonthlyStore.setState({ currentMonthlyId: null });
      selectMandalart(id);
    } else if (template === 'block6') {
      if (currentMandalartId) useMandalartStore.setState({ currentId: null });
      if (currentMonthlyId) useMonthlyStore.setState({ currentMonthlyId: null });
      selectBlock6Plan(id);
    } else if (template === 'monthly') {
      if (currentMandalartId) useMandalartStore.setState({ currentId: null });
      if (currentBlock6Id) useBlock6Store.setState({ currentBlock6Id: null });
      selectMonthlyPlan(id);
    }
  };

  const handleDeleteClick = (id: string, template: TemplateType) => {
    let plan: PlanData | undefined;
    if (template === 'mandalart') {
      plan = mandalarts.find(m => m.id === id);
    } else if (template === 'block6') {
      plan = block6Plans.find(p => p.id === id);
    } else if (template === 'monthly') {
      plan = monthlyPlans.find(p => p.id === id);
    }
    if (plan) {
      setDeleteTarget({ plan, template });
    }
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      if (deleteTarget.template === 'mandalart') {
        deleteMandalart(deleteTarget.plan.id);
      } else if (deleteTarget.template === 'block6') {
        deleteBlock6Plan(deleteTarget.plan.id);
      } else if (deleteTarget.template === 'monthly') {
        deleteMonthlyPlan(deleteTarget.plan.id);
      }
      setDeleteTarget(null);
    }
  };

  const handleShowGuide = (template: TemplateType) => {
    setPendingTemplate(template);
    if (template === 'mandalart') {
      setShowMandalartGuide(true);
    } else if (template === 'block6') {
      setShowBlock6Guide(true);
    } else if (template === 'monthly') {
      setShowMonthlyGuide(true);
    }
  };

  const handleMandalartGuideStart = () => {
    if (createCategory) {
      // Clear other selections
      if (currentBlock6Id) {
        useBlock6Store.setState({ currentBlock6Id: null });
      }
      if (currentMonthlyId) {
        useMonthlyStore.setState({ currentMonthlyId: null });
      }
      createMandalart(createCategory);
      // 선택한 날짜 적용
      if (pendingDate.year !== undefined) {
        useMandalartStore.getState().updatePlanDate(
          pendingDate.year,
          pendingDate.month,
          pendingDate.week,
          pendingDate.day
        );
      }
    }
    setShowMandalartGuide(false);
    setCreateCategory(null);
    setPendingTemplate(null);
    setPendingDate({});
  };

  const handleBlock6GuideStart = () => {
    if (createCategory) {
      // Clear mandalart selection
      if (currentMandalartId) {
        useMandalartStore.setState({ currentId: null });
      }
      if (currentMonthlyId) {
        useMonthlyStore.setState({ currentMonthlyId: null });
      }
      createBlock6Plan(createCategory);
      // 선택한 날짜 적용
      if (pendingDate.year !== undefined) {
        useBlock6Store.getState().updatePlanDate(
          pendingDate.year,
          pendingDate.month,
          pendingDate.week,
          pendingDate.day
        );
      }
    }
    setShowBlock6Guide(false);
    setCreateCategory(null);
    setPendingTemplate(null);
    setPendingDate({});
  };

  const handleMonthlyGuideStart = () => {
    if (createCategory) {
      // Clear other selections
      if (currentMandalartId) {
        useMandalartStore.setState({ currentId: null });
      }
      if (currentBlock6Id) {
        useBlock6Store.setState({ currentBlock6Id: null });
      }
      // Monthly는 생성 시 year, month를 직접 전달
      createMonthlyPlan(createCategory, pendingDate.year, pendingDate.month);
    }
    setShowMonthlyGuide(false);
    setCreateCategory(null);
    setPendingTemplate(null);
    setPendingDate({});
  };

  const handleGuideClose = () => {
    setShowMandalartGuide(false);
    setShowBlock6Guide(false);
    setShowMonthlyGuide(false);
    setPendingTemplate(null);
    setPendingDate({});
  };

  return (
    <>
      <aside className="w-60 h-screen bg-slate-50 border-r border-slate-200 flex flex-col">
        {/* Logo / Brand */}
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-800">Plannet</h1>
          <p className="text-xs text-slate-400 mt-1">나만의 플래너</p>
        </div>

        {/* Plan Sections */}
        <div className="flex-1 overflow-y-auto p-3">
          {PLAN_CATEGORIES.map((category) => (
            <Section
              key={category}
              category={category}
              plans={getPlansByCategory(category)}
              currentId={currentId}
              currentTemplate={currentTemplate}
              onSelect={handleSelect}
              onCreateClick={() => handleCreateClick(category)}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>

      </aside>

      {/* Template Selection Modal */}
      {createCategory && !showDatePicker && !showMandalartGuide && !showBlock6Guide && !showMonthlyGuide && (
        <TemplateModal
          category={createCategory}
          onSelect={handleTemplateSelect}
          onClose={() => setCreateCategory(null)}
          onShowGuide={handleShowGuide}
        />
      )}

      {/* Date Picker Modal */}
      {showDatePicker && createCategory && (
        <DatePicker
          category={createCategory}
          onSelect={handleDateSelect}
          onClose={handleDatePickerClose}
        />
      )}

      {/* Mandalart Guide Modal */}
      {showMandalartGuide && (
        <MandalartGuide
          onStart={handleMandalartGuideStart}
          onClose={handleGuideClose}
        />
      )}

      {/* Block6 Guide Modal */}
      {showBlock6Guide && (
        <Block6Guide
          onStart={handleBlock6GuideStart}
          onClose={handleGuideClose}
        />
      )}

      {/* Monthly Guide Modal */}
      {showMonthlyGuide && (
        <MonthlyGuide
          onStart={handleMonthlyGuideStart}
          onClose={handleGuideClose}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              플랜을 삭제하시겠습니까?
            </h3>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-medium text-slate-700">{deleteTarget.plan.title || '제목 없음'}</span>
            </p>
            <p className="text-sm text-slate-500 mb-6">
              삭제된 플랜은 복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="
                  flex-1 px-4 py-2 rounded-lg
                  bg-slate-100 text-slate-600
                  hover:bg-slate-200
                  transition-colors duration-200
                  font-medium
                "
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                className="
                  flex-1 px-4 py-2 rounded-lg
                  bg-red-500 text-white
                  hover:bg-red-600
                  transition-colors duration-200
                  font-medium
                "
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
