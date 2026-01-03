'use client';

import { useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import {
  PlanCategory,
  PLAN_CATEGORY_LABELS,
  TemplateType,
  TEMPLATE_LABELS,
  MandalartData,
} from '@/types/mandalart';

const PLAN_CATEGORIES: PlanCategory[] = ['annual', 'monthly', 'weekly', 'daily'];

interface SectionProps {
  category: PlanCategory;
  plans: MandalartData[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
  onDelete: (id: string) => void;
}

function Section({ category, plans, currentId, onSelect, onCreateClick, onDelete }: SectionProps) {
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
          recentPlans.map((plan) => (
            <div
              key={plan.id}
              className={`
                group flex items-center justify-between
                px-2 py-1.5 rounded-lg cursor-pointer
                transition-colors
                ${currentId === plan.id
                  ? 'bg-slate-200 text-slate-800'
                  : 'hover:bg-slate-100 text-slate-600'}
              `}
              onClick={() => onSelect(plan.id)}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm truncate block">
                  {plan.title || '제목 없음'}
                </span>
                <span className="text-xs text-slate-400">
                  {TEMPLATE_LABELS[plan.template]}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(plan.id);
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
          ))
        )}
      </div>
    </div>
  );
}

interface TemplateModalProps {
  category: PlanCategory;
  onSelect: (template: TemplateType) => void;
  onClose: () => void;
}

function TemplateModal({ category, onSelect, onClose }: TemplateModalProps) {
  const templates: { type: TemplateType; description: string }[] = [
    { type: 'mandalart', description: '9x9 그리드로 목표를 세분화' },
    // 추후 추가: calendar, checklist 등
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
            <button
              key={template.type}
              onClick={() => onSelect(template.type)}
              className="
                w-full p-3 rounded-lg border border-slate-200
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
  const mandalarts = useMandalartStore((state) => state.mandalarts);
  const currentId = useMandalartStore((state) => state.currentId);
  const createMandalart = useMandalartStore((state) => state.createMandalart);
  const selectMandalart = useMandalartStore((state) => state.selectMandalart);
  const deleteMandalart = useMandalartStore((state) => state.deleteMandalart);

  const [createCategory, setCreateCategory] = useState<PlanCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MandalartData | null>(null);

  const getPlansByCategory = (category: PlanCategory) => {
    return mandalarts.filter((m) => m.category === category);
  };

  const handleCreateClick = (category: PlanCategory) => {
    setCreateCategory(category);
  };

  const handleTemplateSelect = (template: TemplateType) => {
    if (createCategory && template === 'mandalart') {
      createMandalart(createCategory);
    }
    setCreateCategory(null);
  };

  const handleDeleteClick = (id: string) => {
    const plan = mandalarts.find(m => m.id === id);
    if (plan) {
      setDeleteTarget(plan);
    }
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      deleteMandalart(deleteTarget.id);
      setDeleteTarget(null);
    }
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
              onSelect={selectMandalart}
              onCreateClick={() => handleCreateClick(category)}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200">
          <p className="text-xs text-slate-400 text-center">
            데이터는 브라우저에 저장됩니다
          </p>
        </div>
      </aside>

      {/* Template Selection Modal */}
      {createCategory && (
        <TemplateModal
          category={createCategory}
          onSelect={handleTemplateSelect}
          onClose={() => setCreateCategory(null)}
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
              <span className="font-medium text-slate-700">{deleteTarget.title || '제목 없음'}</span>
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
