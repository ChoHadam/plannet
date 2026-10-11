'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  PlanCategory,
  PLAN_CATEGORY_LABELS,
  TemplateType,
} from '@/types/mandalart';
import {
  templateRegistry,
  selectExclusive,
  clearAllSelections,
  duplicatePlan,
  BasePlanData,
  TEMPLATE_TYPES,
} from '@/lib/templateRegistry';
import { useAllPlansReactive } from '@/hooks/useAllPlans';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { useDailyStore } from '@/hooks/useDaily';
import { planDisplayTitle, planKey, PlanCategoryFilter, recentPlans, RECENT_PLAN_LIMIT } from '@/lib/planLibrary';
import { DatePicker } from './DatePicker';
import { BackupRestoreModal } from './BackupRestoreModal';
import { useAuth } from './AuthProvider';
import { PlanLibrary, PLAN_CATEGORIES, planDateLabel } from './PlanLibrary';
import { useModalDialog } from '@/hooks/useModalDialog';
import { FOCUS_RING, isMobileViewport, TOUCH_REVEAL, TOUCH_TARGET } from '@/lib/constants';
import { InstallHelpButton } from './InstallHelp';
import { createPlanWithDefaults, PlanDate } from '@/lib/planCreation';

// 고정 토글 버튼 위치. body의 safe-area padding을 받지 않으므로 같은 inset을 더한다 (펼침: 사이드바 폭 240 + 12).
const TOGGLE_TOP = 'top-[calc(1rem+env(safe-area-inset-top))]';
const TOGGLE_LEFT = 'left-[calc(1rem+env(safe-area-inset-left))]';
const TOGGLE_LEFT_EXPANDED = 'md:left-[calc(252px+env(safe-area-inset-left))]';

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
  onShowAll: () => void;
}

function Section({ category, plans, currentId, currentTemplate, onSelect, onCreateClick, onDelete, onDuplicate, onShowAll }: SectionProps) {
  // 템플릿이 달라도 id가 겹칠 수 있으므로 메뉴는 template+id 키로 연다.
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const visiblePlans = recentPlans(plans);
  const hiddenCount = plans.length - visiblePlans.length;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-2">
        <h3 className="text-sm font-semibold text-slate-600">
          {PLAN_CATEGORY_LABELS[category]}
        </h3>
        <button
          onClick={onCreateClick}
          className={`
            relative w-6 h-6 rounded flex items-center justify-center touch-hit
            text-slate-400 transition-colors
            hover:bg-slate-100 hover:text-slate-600
          `}
          title="새로 만들기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      <div className="space-y-1">
        {visiblePlans.length === 0 ? (
          <p className="text-xs text-slate-400 px-2 py-2">
            플랜이 없습니다
          </p>
        ) : (
          visiblePlans.map((plan) => {
            const isSelected = currentId === plan.id && currentTemplate === plan.template;
            const entry = templateRegistry[plan.template];
            const key = planKey(plan);
            return (
              <div
                key={key}
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
                {/* 행 전체 클릭은 위 onClick이 받는다. 버튼은 키보드 초점·Enter 선택용이며 click이 행으로 전파된다. */}
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm truncate">
                      {planDisplayTitle(plan)}
                    </span>
                    <span className={`
                      flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full
                      ${entry.badgeColor}
                    `}>
                      {entry.label}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {planDateLabel(plan)}
                  </span>
                </button>
                <div className="relative ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenKey(menuOpenKey === key ? null : key);
                    }}
                    aria-label={`${planDisplayTitle(plan)} 메뉴`}
                    aria-expanded={menuOpenKey === key}
                    className={`
                      ${TOUCH_REVEAL} focus:opacity-100 relative touch-hit
                      w-5 h-5 rounded flex items-center justify-center
                      text-slate-400 hover:text-slate-600 hover:bg-slate-100
                      transition-all
                    `}
                    title="메뉴"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                  {menuOpenKey === key && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpenKey(null)} />
                      <div className="absolute right-0 top-6 z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[90px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenKey(null);
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
                            setMenuOpenKey(null);
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
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="w-full px-2 py-1.5 rounded-lg text-left text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label={`${PLAN_CATEGORY_LABELS[category]} 전체 ${plans.length}개 보기`}
          >
            더보기 · 전체 {plans.length}개 (최근 {RECENT_PLAN_LIMIT}개 표시 중)
          </button>
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
  const titleId = useId();
  const { dialogProps } = useModalDialog({ onClose });

  return (
    <div className="fixed inset-0 overlay-safe bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div
        {...dialogProps}
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 max-h-full overflow-y-auto animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-800 mb-2">
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
                aria-label={`${template.label} 사용법 보기`}
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
  const { allPlans, currentTemplate, currentId, getPlansByCategory } = useAllPlansReactive();
  // PlannerWorkspace와 같은 조건: 선택한 플랜도, 플랜 없이 보는 월·일도 없으면 홈(오늘 할 일·최근 작업)이다.
  const viewingMonth = useMonthlyStore((state) => !!state.viewedMonth);
  const viewingDay = useDailyStore((state) => !!state.viewedDay);
  const isHome = !currentTemplate && !viewingMonth && !viewingDay;
  // 서버 백업이 막힌 환경에서는 진입점을 숨긴다. 실제 차단은 /api/backup이 한다.
  const { config, storageScope } = useAuth();
  // 보관함 상태는 연 시점의 저장 범위에 묶는다. 범위가 바뀌면 이전 계정의 목록을 이어서 보여주지 않는다.
  const [libraryRequest, setLibraryRequest] = useState<{ scope: string | null; category: PlanCategoryFilter } | null>(null);
  const libraryCategory = libraryRequest && libraryRequest.scope === storageScope ? libraryRequest.category : null;
  const openLibrary = (category: PlanCategoryFilter) => setLibraryRequest({ scope: storageScope, category });
  const closeLibrary = () => setLibraryRequest(null);

  const [createCategory, setCreateCategory] = useState<PlanCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ plan: BasePlanData; template: TemplateType } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; template: TemplateType; category: PlanCategory } | null>(null);
  const [showGuide, setShowGuide] = useState<TemplateType | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateType | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'create' | 'duplicate' | null>(null);
  const [showBackup, setShowBackup] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 모바일 사이드바는 열고 닫을 때 토글 버튼이 숨거나 영역이 inert가 되어 초점을 잃는다.
  // 잃은 초점만 옮긴다: 열리면 닫기 버튼, 닫히면 열기 버튼. 데스크탑 토글은 그대로 둔다.
  const wasCollapsedRef = useRef(collapsed);
  useEffect(() => {
    if (wasCollapsedRef.current === collapsed) return;
    wasCollapsedRef.current = collapsed;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (collapsed) {
      if (lost || asideRef.current?.contains(active)) toggleRef.current?.focus();
    } else if (isMobileViewport() && (lost || active === toggleRef.current)) {
      closeRef.current?.focus();
    }
  }, [collapsed]);

  /** 모바일에서 편집 화면을 보여줘야 할 때(선택·생성·복제 후) 열린 사이드바를 닫는다 */
  const closeOnMobile = () => {
    if (!collapsed && isMobileViewport()) onToggleCollapse?.();
  };

  // ---- Handlers ----

  const handleTemplateSelect = (template: TemplateType) => {
    setPendingTemplate(template);
    setShowDatePicker('create');
  };

  const handleDateSelect = (year?: number, month?: number, week?: number, day?: number) => {
    const date: PlanDate = { year, month, week, day };
    setShowDatePicker(null);

    if (duplicateTarget) {
      // 복제 플로우: 날짜 선택 후 바로 복제
      for (const t of TEMPLATE_TYPES) {
        if (t !== duplicateTarget.template) templateRegistry[t].clearSelection();
      }
      duplicatePlan(duplicateTarget.id, duplicateTarget.template, date);
      // 복제본이 선택되므로 보관함을 닫아 편집 화면을 보여준다.
      closeLibrary();
      closeOnMobile();
      setDuplicateTarget(null);
    } else if (createCategory && pendingTemplate) {
      // 생성 플로우: 날짜 선택이 마지막 단계다. 가이드는 템플릿 선택의 사용법 버튼·헤더 사용법에서 따로 연다.
      createPlanWithDefaults(pendingTemplate, createCategory, date);
      closeOnMobile();
      setCreateCategory(null);
      setPendingTemplate(null);
    }
  };

  const handleSelect = (id: string, template: TemplateType) => {
    selectExclusive(template, id);
    closeLibrary();
    closeOnMobile();
  };

  /** 홈: 선택만 비운다(플랜·저장 대기 중인 수정은 그대로). 주소 기록은 usePlanSelectionUrl이 한 번 남긴다. */
  const handleHome = () => {
    clearAllSelections();
    closeLibrary();
    closeOnMobile();
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
    setShowGuide(template);
  };

  /** 템플릿 선택에서 연 사용법의 '시작하기'는 그 템플릿으로 날짜 선택을 이어 간다 */
  const handleGuideStart = () => {
    const template = showGuide;
    setShowGuide(null);
    if (template && createCategory) handleTemplateSelect(template);
  };

  /** 사용법을 닫으면(Esc 포함) 템플릿 선택으로 돌아간다 */
  const handleGuideClose = () => {
    setShowGuide(null);
  };

  return (
    <>
      {/* Mobile backdrop — 사이드바가 열렸을 때만 표시. 데스크탑에서는 hidden */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={onToggleCollapse}
        />
      )}

      <aside
        ref={asideRef}
        // 접힌 사이드바(모바일: 화면 밖, 데스크탑: 폭 0)는 키보드·보조기기에서도 빠진다.
        inert={collapsed}
        aria-label="사이드바"
        className={`
          bg-slate-50 border-r border-slate-200 flex flex-col
          transition-all duration-300 ease-in-out
          fixed inset-y-0 left-0 z-40 w-72 shadow-xl pt-safe pl-safe pb-keyboard
          md:static md:h-app md:p-0 md:shadow-none md:flex-shrink-0
          ${collapsed
            ? '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden'
            : 'translate-x-0 md:w-60'}
        `}
      >
        {/* Logo / Brand */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Plannet</h1>
              <p className="text-xs text-slate-400 mt-1">나만의 플래너</p>
            </div>
            {/* 모바일 전용 닫기. 데스크탑은 바깥의 접기 버튼을 쓴다. */}
            <button
              ref={closeRef}
              type="button"
              onClick={onToggleCollapse}
              aria-label="사이드바 닫기"
              title="사이드바 닫기"
              className={`md:hidden -mr-1 flex h-9 w-9 ${TOUCH_TARGET} items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 ${FOCUS_RING}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={handleHome}
            aria-current={isHome ? 'page' : undefined}
            className={`
              mt-3 w-full flex items-center gap-2 px-2 h-9 ${TOUCH_TARGET} rounded-lg
              text-sm font-medium transition-colors ${FOCUS_RING}
              ${isHome ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V21h14V9.5" />
            </svg>
            홈
          </button>
          <button
            type="button"
            onClick={() => openLibrary('all')}
            className="
              mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
              border border-slate-200 bg-white
              text-xs text-slate-500 hover:text-slate-700 hover:border-slate-300
              transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
            "
            aria-label={`전체 플랜 보기 (${allPlans.length}개)`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="flex-1 text-left">전체 플랜 · 검색</span>
            <span className="text-slate-400">{allPlans.length}</span>
          </button>
        </div>

        {/* Plan Sections */}
        <div className="flex-1 overflow-y-auto p-3">
          {PLAN_CATEGORIES.map((category) => (
            <Section
              key={`${storageScope}:${category}`}
              category={category}
              plans={getPlansByCategory(category)}
              currentId={currentId}
              currentTemplate={currentTemplate}
              onSelect={handleSelect}
              onCreateClick={() => setCreateCategory(category)}
              onDelete={handleDeleteClick}
              onDuplicate={handleDuplicate}
              onShowAll={() => openLibrary(category)}
            />
          ))}
        </div>

        {/* Footer: 홈 화면 앱 안내 (이미 홈 화면 앱이면 숨김) · 백업 */}
        <InstallHelpButton />
        {config.backupEnabled && (
          <div className="p-3 border-t border-slate-200">
            <button
              onClick={() => setShowBackup(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                       text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100
                       transition-colors"
              title="백업 복원"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              백업 복원
            </button>
          </div>
        )}
      </aside>

      {/* Sidebar Toggle Button
          - 모바일: 사이드바 닫혀있을 때만 햄버거 표시 (열려있으면 backdrop 클릭 또는 자동 닫힘)
          - 데스크탑: 기존대로 토글 버튼 (collapsed 상태 따라 위치 이동) */}
      <button
        ref={toggleRef}
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '사이드바 열기' : '사이드바 접기'}
        className={`
          ${FOCUS_RING}
          fixed z-50 p-2 touch:p-3 rounded-lg ${TOGGLE_TOP}
          bg-white border border-slate-200 shadow-sm
          text-slate-500 hover:text-slate-700 hover:bg-slate-50
          transition-all duration-300
          ${collapsed ? TOGGLE_LEFT : `${TOGGLE_LEFT} ${TOGGLE_LEFT_EXPANDED}`}
          ${!collapsed ? 'hidden md:block' : ''}
        `}
        title={collapsed ? '사이드바 열기' : '사이드바 접기'}
      >
        {/* 데스크탑: chevron (collapsed 시 회전) */}
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
          className={`hidden md:block transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {/* 모바일: 햄버거 */}
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
          className="md:hidden"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Plan Library — 복제 날짜 선택·삭제 확인 모달이 위에 뜨도록 먼저 렌더링한다 */}
      {libraryCategory && (
        <PlanLibrary
          key={storageScope}
          plans={allPlans}
          initialCategory={libraryCategory}
          currentId={currentId}
          currentTemplate={currentTemplate}
          onSelect={handleSelect}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteClick}
          onClose={closeLibrary}
          suspended={showDatePicker !== null || deleteTarget !== null}
        />
      )}

      {/* Template Selection Modal */}
      {createCategory && showDatePicker === null && !showGuide && (
        <TemplateModal
          category={createCategory}
          onSelect={handleTemplateSelect}
          onClose={() => setCreateCategory(null)}
          onShowGuide={handleShowGuide}
        />
      )}

      {/* Date Picker Modal — 초점 진입·순환·Esc·복귀는 DatePicker의 공통 모달 동작이 맡는다 */}
      {showDatePicker && (
        <DatePicker
          category={(showDatePicker === 'duplicate' ? duplicateTarget?.category : createCategory) ?? 'weekly'}
          onSelect={handleDateSelect}
          onClose={() => {
            setShowDatePicker(null);
            setDuplicateTarget(null);
            setPendingTemplate(null);
          }}
        />
      )}

      {/* Guide Modal (unified) */}
      {showGuide && (() => {
        const Guide = templateRegistry[showGuide].GuideComponent;
        return <Guide onStart={handleGuideStart} onClose={handleGuideClose} />;
      })()}

      {/* Backup Restore Modal */}
      <BackupRestoreModal isOpen={showBackup && config.backupEnabled} onClose={() => setShowBackup(false)} />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 overlay-safe bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 max-h-full overflow-y-auto animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              플랜을 삭제하시겠습니까?
            </h3>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-medium text-slate-700">{planDisplayTitle(deleteTarget.plan)}</span>
            </p>
            <p className="text-sm text-slate-500 mb-6">
              삭제된 플랜은 복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                autoFocus
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
