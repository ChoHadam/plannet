'use client';

import { useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { exportToJSON, importFromJSON, exportToImage } from '@/lib/export';
import { MandalartData, TemplateType, PlanCategory } from '@/types/mandalart';
import { templateRegistry, TEMPLATE_TYPES, BasePlanData } from '@/lib/templateRegistry';
import { DatePicker, formatPlanDate } from './DatePicker';
import { MandalartGuide } from './MandalartGuide';

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
  const plans: Record<TemplateType, BasePlanData | null> = {} as any;
  const updateTitles: Record<TemplateType, (t: string) => void> = {} as any;
  const updateDates: Record<TemplateType, (y?: number, m?: number, w?: number, d?: number) => void> = {} as any;

  for (const t of TEMPLATE_TYPES) {
    const entry = templateRegistry[t];
    plans[t] = entry.useCurrentPlan();
    updateTitles[t] = entry.useUpdateTitle();
    updateDates[t] = entry.useUpdatePlanDate();
  }

  for (const t of TEMPLATE_TYPES) {
    const plan = plans[t];
    if (plan) {
      return {
        template: t,
        title: plan.title,
        category: plan.category,
        year: plan.year,
        month: plan.month,
        week: plan.week,
        day: plan.day,
        updateTitle: updateTitles[t],
        updatePlanDate: updateDates[t],
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
  const [pendingImport, setPendingImport] = useState<MandalartData | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (!plan) return null;

  const isMandalart = plan.template === 'mandalart';
  const placeholder = templateRegistry[plan.template].placeholder;

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
    setShowMenu(false);
  };

  const handleImportJSON = async () => {
    setShowMenu(false);
    const importedData = await importFromJSON();
    if (importedData && mandalartData) {
      if (isCurrentPlanEmpty()) {
        applyImport(importedData);
      } else {
        setPendingImport(importedData);
        setShowImportConfirm(true);
      }
    }
  };

  const applyImport = (importedData: MandalartData) => {
    if (!mandalartData) return;
    const store = useMandalartStore.getState();
    const idx = store.mandalarts.findIndex(m => m.id === mandalartData.id);
    if (idx !== -1) {
      store.mandalarts[idx] = {
        ...importedData,
        id: mandalartData.id,
        category: mandalartData.category,
        updatedAt: new Date().toISOString(),
      };
      useMandalartStore.setState({ mandalarts: [...store.mandalarts] });
    }
  };

  const handleConfirmImport = () => {
    if (pendingImport) applyImport(pendingImport);
    setPendingImport(null);
    setShowImportConfirm(false);
  };

  const handleExportImage = () => {
    if (mandalartData) exportToImage('mandalart-grid', mandalartData.title || 'mandalart');
    setShowMenu(false);
  };

  return (
    <>
      <header className="w-full max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              value={plan.title}
              onChange={(e) => plan.updateTitle(e.target.value)}
              placeholder={placeholder}
              className="
                text-2xl sm:text-3xl font-bold text-slate-800
                bg-transparent border-none outline-none
                placeholder:text-slate-300
                text-center sm:text-left
                w-full sm:w-auto sm:flex-1
              "
            />

            <button
              onClick={() => setShowDatePicker(true)}
              className="
                px-3 py-1 rounded-full
                bg-slate-100 text-slate-600
                hover:bg-slate-200
                transition-colors duration-200
                text-sm font-medium
                shrink-0
              "
              title="날짜 변경"
            >
              {formatPlanDate(plan.category, plan.year, plan.month, plan.week, plan.day)}
            </button>

            {isMandalart && onOpenAIChat && (
              <button
                onClick={onOpenAIChat}
                className="
                  px-3 py-1.5 rounded-lg
                  bg-violet-500 text-white text-sm font-medium
                  hover:bg-violet-600 transition-colors
                  flex items-center gap-1.5
                "
                title="AI 어시스턴트"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V12h2a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4 4 4 0 0 1 4-4h2V9.4A4 4 0 0 1 12 2z" />
                </svg>
                AI
                <span className="text-xs px-1 py-0.5 bg-white/20 rounded">Beta</span>
              </button>
            )}

            {isMandalart && progress.total > 0 && (
              <div className="flex items-center gap-2 shrink-0">
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
          </div>

          {isMandalart && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors duration-200"
                title="메뉴"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50 py-1">
                    <button onClick={() => { setShowMenu(false); setShowGuide(true); }} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                      가이드
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <div className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase">저장</div>
                    <button onClick={handleExportJSON} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      JSON 저장
                    </button>
                    <button onClick={handleExportImage} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      이미지 저장
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <div className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase">불러오기</div>
                    <button onClick={handleImportJSON} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                      JSON 불러오기
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button onClick={() => { setShowMenu(false); setShowResetConfirm(true); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                      초기화
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">정말 초기화하시겠습니까?</h3>
            <p className="text-sm text-slate-500 mb-6">모든 데이터가 삭제되며 복구할 수 없습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors duration-200 font-medium">취소</button>
              <button onClick={handleReset} className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors duration-200 font-medium">초기화</button>
            </div>
          </div>
        </div>
      )}

      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">현재 플랜을 덮어쓰시겠습니까?</h3>
            <p className="text-sm text-slate-500 mb-6">기존 내용이 불러온 파일의 내용으로 대체됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowImportConfirm(false); setPendingImport(null); }} className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors duration-200 font-medium">취소</button>
              <button onClick={handleConfirmImport} className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-200 font-medium">덮어쓰기</button>
            </div>
          </div>
        </div>
      )}

      {showDatePicker && (
        <DatePicker
          category={plan.category}
          year={plan.year}
          month={plan.month}
          week={plan.week}
          day={plan.day}
          onSelect={(year, month, week, day) => plan.updatePlanDate(year, month, week, day)}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {showGuide && (
        <MandalartGuide
          onStart={() => setShowGuide(false)}
          onClose={() => setShowGuide(false)}
        />
      )}
    </>
  );
}
