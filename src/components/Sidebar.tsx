'use client';

import { useState } from 'react';
import {
  PlanCategory,
  PLAN_CATEGORY_LABELS,
  TemplateType,
} from '@/types/mandalart';
import {
  templateRegistry,
  selectExclusive,
  getAllTitles,
  duplicatePlan,
  BasePlanData,
  TEMPLATE_TYPES,
} from '@/lib/templateRegistry';
import { useAllPlansReactive } from '@/hooks/useAllPlans';
import { DatePicker, formatPlanDate } from './DatePicker';

const PLAN_CATEGORIES: PlanCategory[] = ['annual', 'monthly', 'weekly', 'daily'];

function generateDefaultTitle(
  category: PlanCategory,
  date: { year?: number; month?: number; week?: number; day?: number },
  existingTitles: string[]
): string {
  const now = new Date();
  const y = date.year ?? now.getFullYear();
  const m = date.month ?? now.getMonth() + 1;
  const mm = String(m).padStart(2, '0');

  let base: string;
  switch (category) {
    case 'annual':
      base = `${y}`;
      break;
    case 'monthly':
      base = `${y}.${mm}`;
      break;
    case 'weekly': {
      const w = date.week ?? 1;
      base = `${y}.${mm} W${w}`;
      break;
    }
    case 'daily': {
      const d = date.day ?? now.getDate();
      const dd = String(d).padStart(2, '0');
      base = `${y}.${mm}.${dd}`;
      break;
    }
  }

  if (!existingTitles.includes(base)) return base;

  let n = 2;
  while (existingTitles.includes(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

// ---- Section Component ----

interface SectionProps {
  category: PlanCategory;
  plans: BasePlanData[];
  currentId: string | null;
  currentTemplate: TemplateType | null;
  onSelect: (id: string, template: TemplateType) => void;
  onCreateClick: () => void;
  onDelete: (id: string, template: TemplateType) => void;
  onDuplicate: (id: string, template: TemplateType) => void;
}

function Section({ category, plans, currentId, currentTemplate, onSelect, onCreateClick, onDelete, onDuplicate }: SectionProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
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
            const entry = templateRegistry[plan.template];
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
                      ${entry.badgeColor}
                    `}>
                      {entry.label}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {plan.template === 'monthly'
                      ? formatPlanDate('monthly', plan.year, plan.month, undefined, undefined, true)
                      : formatPlanDate(plan.category, plan.year, plan.month, plan.week, plan.day, true)
                    }
                  </span>
                </div>
                <div className="relative ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === plan.id ? null : plan.id);
                    }}
                    className="
                      opacity-0 group-hover:opacity-100
                      w-5 h-5 rounded flex items-center justify-center
                      text-slate-400 hover:text-slate-600 hover:bg-slate-100
                      transition-all
                    "
                    title="메뉴"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                  {menuOpenId === plan.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                      <div className="absolute right-0 top-6 z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[90px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                            onDuplicate(plan.id, plan.template);
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          복제
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                            onDelete(plan.id, plan.template);
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---- TemplateModal Component ----

interface TemplateModalProps {
  category: PlanCategory;
  onSelect: (template: TemplateType) => void;
  onClose: () => void;
  onShowGuide: (template: TemplateType) => void;
}

function TemplateModal({ category, onSelect, onClose, onShowGuide }: TemplateModalProps) {
  const templates = TEMPLATE_TYPES
    .filter(t => templateRegistry[t].allowedCategories.includes(category))
    .map(t => ({
      type: templateRegistry[t].type,
      label: templateRegistry[t].label,
      description: templateRegistry[t].description,
      isRecommended: templateRegistry[t].defaultForCategory === category,
    }))
    .sort((a, b) => (a.isRecommended === b.isRecommended ? 0 : a.isRecommended ? -1 : 1));

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
                className={`
                  flex-1 p-3 rounded-lg border text-left transition-colors
                  ${template.isRecommended
                    ? 'border-indigo-300 bg-indigo-50/50 hover:border-indigo-400 hover:bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}
                `}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">{template.label}</span>
                  {template.isRecommended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500 text-white leading-none">
                      추천
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {template.description}
                </div>
              </button>
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
                title={`${template.label} 사용법`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </button>
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

// ---- Main Sidebar ----

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const { currentTemplate, currentId, getPlansByCategory } = useAllPlansReactive();

  const [createCategory, setCreateCategory] = useState<PlanCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ plan: BasePlanData; template: TemplateType } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; template: TemplateType; category: PlanCategory } | null>(null);
  const [showGuide, setShowGuide] = useState<TemplateType | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateType | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'create' | 'duplicate' | null>(null);
  const [pendingDate, setPendingDate] = useState<{
    year?: number;
    month?: number;
    week?: number;
    day?: number;
  }>({});

  // ---- Handlers ----

  const handleTemplateSelect = (template: TemplateType) => {
    setPendingTemplate(template);
    setShowDatePicker('create');
  };

  const handleDateSelect = (year?: number, month?: number, week?: number, day?: number) => {
    const date = { year, month, week, day };
    setPendingDate(date);
    setShowDatePicker(null);

    if (duplicateTarget) {
      // 복제 플로우: 날짜 선택 후 바로 복제
      for (const t of TEMPLATE_TYPES) {
        if (t !== duplicateTarget.template) templateRegistry[t].clearSelection();
      }
      duplicatePlan(duplicateTarget.id, duplicateTarget.template, date);
      setDuplicateTarget(null);
      setPendingDate({});
    } else {
      // 생성 플로우: 날짜 선택 후 가이드 표시
      setShowGuide(pendingTemplate);
    }
  };

  const handleSelect = (id: string, template: TemplateType) => {
    selectExclusive(template, id);
  };

  const handleDeleteClick = (id: string, template: TemplateType) => {
    const plan = templateRegistry[template].getPlans().find(p => p.id === id);
    if (plan) setDeleteTarget({ plan, template });
  };

  const handleDuplicate = (id: string, template: TemplateType) => {
    const plan = templateRegistry[template].getPlans().find(p => p.id === id);
    if (!plan) return;
    setDuplicateTarget({ id, template, category: plan.category });
    setShowDatePicker('duplicate');
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      templateRegistry[deleteTarget.template].deletePlan(deleteTarget.plan.id);
      setDeleteTarget(null);
    }
  };

  const handleShowGuide = (template: TemplateType) => {
    setPendingTemplate(template);
    setShowGuide(template);
  };

  const handleGuideStart = () => {
    if (createCategory && showGuide) {
      const entry = templateRegistry[showGuide];

      // Clear other selections
      for (const t of TEMPLATE_TYPES) {
        if (t !== showGuide) templateRegistry[t].clearSelection();
      }

      entry.create(createCategory, pendingDate);
      const defaultTitle = generateDefaultTitle(createCategory, pendingDate, getAllTitles());
      entry.applyTitleAndDate(defaultTitle, pendingDate);
    }
    setShowGuide(null);
    setCreateCategory(null);
    setPendingTemplate(null);
    setPendingDate({});
  };

  const handleGuideClose = () => {
    setShowGuide(null);
    setPendingTemplate(null);
    setPendingDate({});
  };

  return (
    <>
      <aside
        className={`
          h-screen bg-slate-50 border-r border-slate-200 flex flex-col
          transition-all duration-300 ease-in-out flex-shrink-0
          ${collapsed ? 'w-0 overflow-hidden' : 'w-60'}
        `}
      >
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
              onCreateClick={() => setCreateCategory(category)}
              onDelete={handleDeleteClick}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      </aside>

      {/* Sidebar Toggle Button */}
      <button
        onClick={onToggleCollapse}
        className={`
          fixed top-4 z-40 p-2 rounded-lg
          bg-white border border-slate-200 shadow-sm
          text-slate-500 hover:text-slate-700 hover:bg-slate-50
          transition-all duration-300
          ${collapsed ? 'left-4' : 'left-[252px]'}
        `}
        title={collapsed ? '사이드바 열기' : '사이드바 접기'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      {/* Template Selection Modal */}
      {createCategory && showDatePicker === null && !showGuide && (
        <TemplateModal
          category={createCategory}
          onSelect={handleTemplateSelect}
          onClose={() => setCreateCategory(null)}
          onShowGuide={handleShowGuide}
        />
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DatePicker
          category={(showDatePicker === 'duplicate' ? duplicateTarget?.category : createCategory) ?? 'weekly'}
          onSelect={handleDateSelect}
          onClose={() => {
            setShowDatePicker(null);
            setDuplicateTarget(null);
          }}
        />
      )}

      {/* Guide Modal (unified) */}
      {showGuide && (() => {
        const Guide = templateRegistry[showGuide].GuideComponent;
        return <Guide onStart={handleGuideStart} onClose={handleGuideClose} />;
      })()}

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
