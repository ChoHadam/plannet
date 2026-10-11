'use client';

import { useEffect, useRef, useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { exportToJSON, importFromJSON, exportToImage } from '@/lib/export';
import { MandalartData, TemplateType, PlanCategory } from '@/types/mandalart';
import { templateRegistry, TEMPLATE_TYPES, BasePlanData } from '@/lib/templateRegistry';
import { DatePicker, formatPlanDate } from './DatePicker';
import { ConfirmDialog } from './ConfirmDialog';
import { getPlannerStorageScope } from '@/lib/plannerStorage';
import { FOCUS_RING, TOUCH_TARGET } from '@/lib/constants';

interface ImportContext {
  epoch: number;
  scope: string;
  original: MandalartData;
}

interface PendingImport {
  data: MandalartData;
  context: ImportContext;
}

/** 헤더 사용법은 읽기만 한다. 가이드의 시작 버튼은 플랜을 만들지 않고 닫는다. */
const HELP_GUIDE_CLOSE_LABEL = '확인';

/** 헤더의 날짜·사용법·메뉴 칩. 모바일 터치 높이 36px 이상 */
// 터치 기기에서는 44px (TOUCH_TARGET)
const HEADER_CHIP = `min-h-9 ${TOUCH_TARGET} rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors duration-200 text-sm font-medium shrink-0 flex items-center gap-1 ${FOCUS_RING}`;
const MENU_ITEM = 'w-full min-h-9 touch:min-h-11 px-4 py-2 text-left text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500';
const MENU_SECTION = 'px-3 py-1.5 text-xs font-medium text-slate-400';
const HEADER_MENU_ID = 'plan-header-menu';

const IMPORT_CONTEXT_CHANGED_MESSAGE = '파일을 불러오는 동안 플랜이 바뀌었어요. 현재 내용을 보존했으니 다시 불러와 주세요.';

interface HeaderProps {
  onOpenAIChat?: () => void;
}

interface ActivePlanInfo {
  template: TemplateType;
  title: string;
  category: PlanCategory;
  year?: number;
  month?: number;
  week?: number;
  day?: number;
  updateTitle: (title: string) => void;
  updatePlanDate: (year?: number, month?: number, week?: number, day?: number) => void;
}

function useActivePlan(): ActivePlanInfo | null {
  // Call all hooks unconditionally (React hooks rules)
  const plans: Partial<Record<TemplateType, BasePlanData | null>> = {};
  const updateTitles: Partial<Record<TemplateType, (t: string) => void>> = {};
  const updateDates: Partial<Record<TemplateType, (y?: number, m?: number, w?: number, d?: number) => void>> = {};

  for (const t of TEMPLATE_TYPES) {
    const entry = templateRegistry[t];
    plans[t] = entry.useCurrentPlan();
    updateTitles[t] = entry.useUpdateTitle();
    updateDates[t] = entry.useUpdatePlanDate();
  }

  for (const t of TEMPLATE_TYPES) {
    const plan = plans[t];
    const updateTitle = updateTitles[t];
    const updatePlanDate = updateDates[t];
    if (plan && updateTitle && updatePlanDate) {
      return {
        template: t,
        title: plan.title,
        category: plan.category,
        year: plan.year,
        month: plan.month,
        week: plan.week,
        day: plan.day,
        updateTitle,
        updatePlanDate,
      };
    }
  }
  return null;
}

export function Header({ onOpenAIChat }: HeaderProps) {
  const plan = useActivePlan();

  // Mandalart-specific state
  const mandalartData = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find(m => m.id === state.currentId) || null;
  });
  const resetCurrent = useMandalartStore((state) => state.resetCurrent);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const importEpoch = useRef(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴를 열면 첫 항목으로 초점을 옮긴다.
  useEffect(() => {
    if (showMenu) menuRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [showMenu]);

  /** 메뉴를 닫고 메뉴 버튼으로 초점을 돌린다. 이어서 여는 확인 창은 닫힐 때 이 버튼으로 돌아온다. */
  const closeMenu = () => {
    setShowMenu(false);
    menuButtonRef.current?.focus();
  };

  // File selection and confirmation can outlive the plan they were opened for.
  // Invalidate synchronously, including A → B → A and full plan replacement.
  useEffect(() => {
    const unsubscribe = useMandalartStore.subscribe((state, previous) => {
      if (state.currentId !== previous.currentId || state.resetToken !== previous.resetToken) {
        importEpoch.current += 1;
        setPendingImport(null);
        setShowImportConfirm(false);
      }
    });
    return () => {
      importEpoch.current += 1;
      unsubscribe();
    };
  }, []);

  if (!plan) return null;

  const isMandalart = plan.template === 'mandalart';
  const { placeholder, label: templateLabel, GuideComponent: Guide } = templateRegistry[plan.template];
  // Daily always displays a day, even when stored under another sidebar category.
  const dateCategory = plan.template === 'daily' ? 'daily' : plan.category;

  // Mandalart-specific: check if plan is empty
  const isCurrentPlanEmpty = () => {
    if (!mandalartData) return true;
    return mandalartData.grids.every(grid =>
      grid.cells.every(cell => !cell.value.trim())
    ) && !mandalartData.title.trim();
  };

  // Mandalart-specific: progress calculation
  const calculateProgress = () => {
    if (!mandalartData) return { completed: 0, total: 0, percentage: 0 };

    let completed = 0;
    let total = 0;

    mandalartData.grids
      .filter(grid => grid.id !== 'center')
      .forEach(grid => {
        grid.cells
          .filter((_, idx) => idx !== 4)
          .forEach(cell => {
            if (cell.value.trim() && !cell.icon) {
              total++;
              if (cell.completed) completed++;
            }
          });
      });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  };

  const progress = isMandalart ? calculateProgress() : { completed: 0, total: 0, percentage: 0 };

  const handleReset = () => {
    resetCurrent();
    setShowResetConfirm(false);
  };

  const handleExportJSON = () => {
    if (mandalartData) exportToJSON(mandalartData);
    closeMenu();
  };

  const handleImportJSON = async () => {
    closeMenu();
    const scope = getPlannerStorageScope();
    if (!mandalartData || !scope) return;
    const context: ImportContext = { epoch: ++importEpoch.current, scope, original: mandalartData };
    const importedData = await importFromJSON();
    if (importedData) {
      if (!isImportContextCurrent(context)) {
        alert(IMPORT_CONTEXT_CHANGED_MESSAGE);
        return;
      }
      if (isCurrentPlanEmpty()) {
        applyImport({ data: importedData, context });
      } else {
        setPendingImport({ data: importedData, context });
        menuButtonRef.current?.focus();
        setShowImportConfirm(true);
      }
    }
  };

  const isImportContextCurrent = (context: ImportContext) => {
    const store = useMandalartStore.getState();
    return context.epoch === importEpoch.current
      && context.scope === getPlannerStorageScope()
      && store.currentId === context.original.id
      && store.mandalarts.find((item) => item.id === context.original.id) === context.original;
  };

  const applyImport = ({ data, context }: PendingImport) => {
    if (!isImportContextCurrent(context)) {
      alert(IMPORT_CONTEXT_CHANGED_MESSAGE);
      return;
    }
    // Validation is complete. Replace atomically and invalidate any pending AI response.
    useMandalartStore.getState().replaceCurrentMandalart(data);
  };

  const handleConfirmImport = () => {
    if (pendingImport) applyImport(pendingImport);
    setPendingImport(null);
    setShowImportConfirm(false);
  };

  const handleExportImage = () => {
    if (mandalartData) exportToImage('mandalart-grid', mandalartData.title || 'mandalart', mandalartData);
    closeMenu();
  };

  const handleCancelImport = () => {
    setShowImportConfirm(false);
    setPendingImport(null);
  };

  return (
    <>
      <header className="w-full max-w-4xl mx-auto px-4 py-3 md:py-6 pl-14 md:pl-4">
        {/* 모바일·태블릿(사이드바 옆 좁은 본문): 1단=제목, 2단=날짜 + 도구(사용법·AI·메뉴). lg 이상: 1줄 */}
        <div className="flex-1 min-w-0 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
          <input
            type="text"
            value={plan.title}
            onChange={(e) => plan.updateTitle(e.target.value)}
            placeholder={placeholder}
            aria-label="플랜 제목"
            className="
              text-xl md:text-3xl font-bold text-slate-800
              bg-transparent border-none outline-none
              placeholder:text-slate-300
              text-left
              w-full min-w-0 lg:w-auto lg:flex-1
            "
          />

          <div className="flex items-center justify-between gap-2 lg:contents">
            <button
              type="button"
              onClick={() => setShowDatePicker(true)}
              className={`${HEADER_CHIP} px-3`}
              title="플랜 날짜 변경"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              {formatPlanDate(dateCategory, plan.year, plan.month, plan.week, plan.day)}
            </button>

            {/* 보조 도구는 한 묶음. 만다라트의 파일·초기화는 ⋮ 메뉴 안에 둔다 */}
            <div className="flex items-center gap-2 lg:contents">
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                aria-label={`${templateLabel} 사용법`}
                title={`${templateLabel} 사용법`}
                className={`${HEADER_CHIP} min-w-9 justify-center px-2.5`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                {/* 만다라트 모바일은 도구가 많아 아이콘만. 이름은 aria-label·title */}
                <span className={isMandalart ? 'hidden sm:inline' : undefined}>사용법</span>
              </button>
              {isMandalart && onOpenAIChat && (
                <button
                  type="button"
                  onClick={onOpenAIChat}
                  className={`
                    min-h-9 px-3 py-1.5 rounded-lg
                    bg-violet-500 text-white text-sm font-medium
                    hover:bg-violet-600 transition-colors
                    flex items-center gap-1.5 shrink-0
                    ${FOCUS_RING}
                  `}
                  title="AI 어시스턴트"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V12h2a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4 4 4 0 0 1 4-4h2V9.4A4 4 0 0 1 12 2z" />
                  </svg>
                  AI
                  <span className="hidden sm:inline text-xs px-1 py-0.5 bg-white/20 rounded">Beta</span>
                </button>
              )}

              {isMandalart && progress.total > 0 && (
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <div className="w-20 sm:w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-500 min-w-[3ch]">
                    {progress.percentage}%
                  </span>
                </div>
              )}

              {isMandalart && (
                <div
                  className="relative shrink-0"
                  onBlur={(e) => {
                    // Tab 등으로 초점이 메뉴 밖으로 나가면 닫는다.
                    if (showMenu && !e.currentTarget.contains(e.relatedTarget as Node | null)) setShowMenu(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && showMenu) {
                      e.preventDefault();
                      closeMenu();
                    }
                  }}
                >
                  <button
                    ref={menuButtonRef}
                    type="button"
                    onClick={() => setShowMenu(!showMenu)}
                    aria-label="메뉴"
                    aria-expanded={showMenu}
                    aria-controls={showMenu ? HEADER_MENU_ID : undefined}
                    className={`${HEADER_CHIP} min-w-9 justify-center rounded-lg`}
                    title="메뉴"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="1"></circle>
                      <circle cx="12" cy="5" r="1"></circle>
                      <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                  </button>

                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                      <div ref={menuRef} id={HEADER_MENU_ID} role="group" aria-label="만다라트 파일·초기화" className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-slate-200 z-50 py-1">
                        <div className={MENU_SECTION}>파일로 내보내기</div>
                        <button type="button" onClick={handleExportJSON} className={`${MENU_ITEM} text-slate-700 hover:bg-slate-50`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          JSON 저장
                        </button>
                        <button type="button" onClick={handleExportImage} className={`${MENU_ITEM} text-slate-700 hover:bg-slate-50`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                          이미지 저장
                        </button>
                        <div className="border-t border-slate-100 my-1"></div>
                        <div className={MENU_SECTION}>파일에서 가져오기</div>
                        <button type="button" onClick={handleImportJSON} className={`${MENU_ITEM} text-slate-700 hover:bg-slate-50`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                          JSON 불러오기
                        </button>
                        <div className="border-t border-slate-100 my-1"></div>
                        <button type="button" onClick={() => { closeMenu(); setShowResetConfirm(true); }} className={`${MENU_ITEM} text-red-600 hover:bg-red-50`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                          초기화…
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {showResetConfirm && (
        <ConfirmDialog
          title="정말 초기화하시겠습니까?"
          confirmLabel="초기화"
          danger
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        >
          <p>이 만다라트의 모든 칸 내용·완료 표시·일정·아이콘과 색상을 처음 상태로 비워요. 제목과 날짜는 그대로예요.</p>
          <p>되돌릴 수 없어요. 필요하면 먼저 메뉴의 ‘JSON 저장’으로 보관하세요.</p>
        </ConfirmDialog>
      )}

      {showImportConfirm && (
        <ConfirmDialog
          title="현재 플랜을 덮어쓰시겠습니까?"
          confirmLabel="덮어쓰기"
          danger
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
        >
          <p>지금 만다라트의 제목·날짜·모든 칸이 파일 내용으로 바뀌어요. 되돌릴 수 없어요.</p>
          <p>필요하면 취소하고 먼저 메뉴의 ‘JSON 저장’으로 보관하세요.</p>
        </ConfirmDialog>
      )}

      {showDatePicker && (
        <DatePicker
          category={dateCategory}
          year={plan.year}
          month={plan.month}
          week={plan.week}
          day={plan.day}
          onSelect={(year, month, week, day) => plan.updatePlanDate(year, month, week, day)}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {showGuide && (
        <Guide
          startLabel={HELP_GUIDE_CLOSE_LABEL}
          onStart={() => setShowGuide(false)}
          onClose={() => setShowGuide(false)}
        />
      )}
    </>
  );
}
