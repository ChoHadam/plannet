'use client';

import { useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useBlock6Store } from '@/hooks/useBlock6';
import {
  PlanCategory,
  PLAN_CATEGORY_LABELS,
  TemplateType,
  TEMPLATE_LABELS,
  MandalartData,
} from '@/types/mandalart';
import { Block6Data } from '@/types/block6';
import { formatPlanDate } from './DatePicker';
import { MandalartGuide } from './MandalartGuide';
import { Block6Guide } from './Block6';

// Union type for all plan types
type PlanData = MandalartData | Block6Data;

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
                      text-[10px] px-1.5 py-0.5 rounded-full
                      ${plan.template === 'block6'
                        ? 'bg-violet-100 text-violet-600'
                        : 'bg-amber-100 text-amber-600'}
                    `}>
                      {TEMPLATE_LABELS[plan.template]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {formatPlanDate(plan.category, plan.year, plan.month, plan.week, plan.day, true)}
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

  const [createCategory, setCreateCategory] = useState<PlanCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ plan: PlanData; template: TemplateType } | null>(null);
  const [showMandalartGuide, setShowMandalartGuide] = useState(false);
  const [showBlock6Guide, setShowBlock6Guide] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateType | null>(null);

  // Determine current template based on which store has a selection
  const currentTemplate: TemplateType | null = currentMandalartId ? 'mandalart' : currentBlock6Id ? 'block6' : null;
  const currentId = currentMandalartId || currentBlock6Id;

  const getPlansByCategory = (category: PlanCategory): PlanData[] => {
    const mandalartPlans = mandalarts.filter((m) => m.category === category);
    const block6CategoryPlans = block6Plans.filter((p) => p.category === category);
    return [...mandalartPlans, ...block6CategoryPlans];
  };

  const handleCreateClick = (category: PlanCategory) => {
    setCreateCategory(category);
  };

  const handleTemplateSelect = (template: TemplateType) => {
    setPendingTemplate(template);
    if (template === 'mandalart') {
      setShowMandalartGuide(true);
    } else if (template === 'block6') {
      setShowBlock6Guide(true);
    }
  };

  const handleSelect = (id: string, template: TemplateType) => {
    if (template === 'mandalart') {
      // Clear block6 selection when selecting mandalart
      if (currentBlock6Id) {
        useBlock6Store.setState({ currentBlock6Id: null });
      }
      selectMandalart(id);
    } else if (template === 'block6') {
      // Clear mandalart selection when selecting block6
      if (currentMandalartId) {
        useMandalartStore.setState({ currentId: null });
      }
      selectBlock6Plan(id);
    }
  };

  const handleDeleteClick = (id: string, template: TemplateType) => {
    let plan: PlanData | undefined;
    if (template === 'mandalart') {
      plan = mandalarts.find(m => m.id === id);
    } else {
      plan = block6Plans.find(p => p.id === id);
    }
    if (plan) {
      setDeleteTarget({ plan, template });
    }
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      if (deleteTarget.template === 'mandalart') {
        deleteMandalart(deleteTarget.plan.id);
      } else {
        deleteBlock6Plan(deleteTarget.plan.id);
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
    }
  };

  const handleMandalartGuideStart = () => {
    if (createCategory) {
      // Clear block6 selection
      if (currentBlock6Id) {
        useBlock6Store.setState({ currentBlock6Id: null });
      }
      createMandalart(createCategory);
    }
    setShowMandalartGuide(false);
    setCreateCategory(null);
    setPendingTemplate(null);
  };

  const handleBlock6GuideStart = () => {
    if (createCategory) {
      // Clear mandalart selection
      if (currentMandalartId) {
        useMandalartStore.setState({ currentId: null });
      }
      createBlock6Plan(createCategory);
    }
    setShowBlock6Guide(false);
    setCreateCategory(null);
    setPendingTemplate(null);
  };

  const handleGuideClose = () => {
    setShowMandalartGuide(false);
    setShowBlock6Guide(false);
    setPendingTemplate(null);
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
      {createCategory && !showMandalartGuide && !showBlock6Guide && (
        <TemplateModal
          category={createCategory}
          onSelect={handleTemplateSelect}
          onClose={() => setCreateCategory(null)}
          onShowGuide={handleShowGuide}
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
