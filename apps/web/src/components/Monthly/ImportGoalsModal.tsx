'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { extractGroupedActionPlans, extractCellsForMonth, GroupedActionPlans, ScheduledCellItem } from '@/lib/mandalartIntegration';
import { MONTHLY_IMPORT_GOAL_LIMIT, MonthlyImportItem, monthlySourceKey } from '@/lib/monthlyImport';

interface ImportGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGoalsCount: number;
}

export function ImportGoalsModal({ isOpen, onClose, currentGoalsCount }: ImportGoalsModalProps) {
  const [selectedMandalartId, setSelectedMandalartId] = useState<string | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set());
  const [groupedPlans, setGroupedPlans] = useState<GroupedActionPlans[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const mandalarts = useMandalartStore((state) => state.mandalarts);
  const importActionPlans = useMonthlyStore((state) => state.importActionPlans);
  const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);
  const currentMonthlyId = useMonthlyStore((state) => state.currentMonthlyId);

  const currentMonthly = monthlyPlans.find(p => p.id === currentMonthlyId);
  const availableGoalSlots = Math.max(0, MONTHLY_IMPORT_GOAL_LIMIT - currentGoalsCount);
  const reachedSelectionLimit = selectedPlans.size >= availableGoalSlots;

  // 이번 달 추천 항목 (모든 만다라트에서 현재 월 대상 셀 추출)
  const recommendedCells = useMemo<Array<ScheduledCellItem & { sourceMandalartId: string; sourceTitle: string }>>(() => {
    if (!currentMonthly) return [];
    return mandalarts.flatMap(m =>
      extractCellsForMonth(m, currentMonthly.year, currentMonthly.month).map((cell) => ({
        ...cell, sourceMandalartId: m.id, sourceTitle: m.title || '제목 없음',
      }))
    );
  }, [mandalarts, currentMonthly]);

  // 만다라트 선택 시 실천 계획 추출
  useEffect(() => {
    if (selectedMandalartId) {
      const mandalart = mandalarts.find(m => m.id === selectedMandalartId);
      if (mandalart) {
        const groups = extractGroupedActionPlans(mandalart);
        setGroupedPlans(groups);
        // 모든 그룹 펼치기
        setExpandedGroups(new Set(groups.map(g => g.subGoalText)));
      }
    } else {
      setGroupedPlans([]);
    }
    setSelectedPlans(new Set());
  }, [selectedMandalartId, mandalarts]);

  // 모달 열릴 때 첫 번째 만다라트 선택
  useEffect(() => {
    if (isOpen && mandalarts.length > 0 && !selectedMandalartId) {
      setSelectedMandalartId(mandalarts[0].id);
    }
  }, [isOpen, mandalarts, selectedMandalartId]);

  const alreadyImported = (sourceId: string, cellId: string) =>
    currentMonthly?.goals.some((goal) => goal.sourceMandalartId === sourceId && goal.sourceCellId === cellId) ?? false;

  const togglePlan = (planId: string) => {
    const newSelected = new Set(selectedPlans);
    if (newSelected.has(planId)) {
      newSelected.delete(planId);
    } else {
      if (newSelected.size >= availableGoalSlots) return;
      newSelected.add(planId);
    }
    setSelectedPlans(newSelected);
  };

  const toggleGroup = (groupText: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupText)) {
      newExpanded.delete(groupText);
    } else {
      newExpanded.add(groupText);
    }
    setExpandedGroups(newExpanded);
  };

  const handleImport = () => {
    if (selectedPlans.size === 0) return;

    const selectedItems: MonthlyImportItem[] = [];
    const addedIds = new Set<string>();
    const collect = (text: string, cellId: string, sourceMandalartId: string) => {
      const key = monthlySourceKey(sourceMandalartId, cellId);
      if (!selectedPlans.has(key) || addedIds.has(key)) return;
      selectedItems.push({ text, cellId, sourceMandalartId });
      addedIds.add(key);
    };
    recommendedCells.forEach((cell) => collect(cell.text, cell.cellId, cell.sourceMandalartId));
    if (selectedMandalartId) {
      groupedPlans.forEach((group) => group.actionPlans.forEach((plan) =>
        collect(plan.text, plan.id, selectedMandalartId)));
    }
    importActionPlans(selectedItems);
    setSelectedPlans(new Set());
    onClose();
  };

  const handleClose = () => {
    setSelectedPlans(new Set());
    setSelectedMandalartId(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="만다라트에서 목표 불러오기"
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">
            만다라트에서 목표 불러오기
          </h2>
          <button
            onClick={handleClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Mandalart selector */}
        <div className="p-4 border-b border-slate-100">
          <select
            aria-label="원본 만다라트"
            value={selectedMandalartId || ''}
            onChange={(e) => setSelectedMandalartId(e.target.value || null)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">만다라트 선택...</option>
            {mandalarts.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title || '제목 없음'} ({m.year}년)
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {mandalarts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>만다라트가 없습니다.</p>
              <p className="text-sm mt-2">먼저 만다라트를 생성해주세요.</p>
            </div>
          ) : groupedPlans.length === 0 && recommendedCells.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>실천 계획이 없습니다.</p>
              <p className="text-sm mt-2">만다라트에 세부 목표와 실천 계획을 입력해주세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 이번 달 추천 */}
              {recommendedCells.length > 0 && (
                <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50/50">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span className="font-medium text-sm text-blue-700 flex-1">
                      {currentMonthly?.month}월 추천
                    </span>
                    <span className="text-xs text-blue-400">
                      {recommendedCells.length}개
                    </span>
                  </div>
                  <div className="divide-y divide-blue-100">
                    {recommendedCells.map((cell) => {
                      const key = monthlySourceKey(cell.sourceMandalartId, cell.cellId);
                      const isSelected = selectedPlans.has(key);
                      const imported = alreadyImported(cell.sourceMandalartId, cell.cellId);
                      const isDisabled = imported || (!isSelected && reachedSelectionLimit);
                      return (
                        <label
                          key={`rec-${key}`}
                          className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-blue-50"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => togglePlan(key)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-slate-600 block">{cell.text}</span>
                            <span className="text-xs text-slate-400">{cell.sourceTitle} · {cell.subGoalText}{imported ? ' · 이미 불러옴' : ''}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {groupedPlans.map((group) => (
                <div key={group.subGoalText} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.subGoalText)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${expandedGroups.has(group.subGoalText) ? 'rotate-90' : ''}`}
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span className="font-medium text-sm text-slate-700 flex-1">
                      {group.subGoalText}
                    </span>
                    <span className="text-xs text-slate-400">
                      {group.actionPlans.length}개
                    </span>
                  </button>

                  {/* Action plans */}
                  {expandedGroups.has(group.subGoalText) && (
                    <div className="divide-y divide-slate-100">
                      {group.actionPlans.map((plan) => {
                        const key = monthlySourceKey(selectedMandalartId!, plan.id);
                        const isSelected = selectedPlans.has(key);
                        const imported = alreadyImported(selectedMandalartId!, plan.id);
                        const isDisabled = imported || (!isSelected && reachedSelectionLimit);
                        return (
                          <label
                            key={plan.id}
                            className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabled}
                              onChange={() => togglePlan(key)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600 flex-1">
                              {plan.text}{imported ? ' · 이미 불러옴' : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          {selectedPlans.size > 0 && (
            <div className="mb-3 text-xs text-blue-500">
              {selectedPlans.size}개 선택됨 / 최대 {availableGoalSlots}개
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleImport}
              disabled={selectedPlans.size === 0 || availableGoalSlots === 0}
              className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selectedPlans.size}개 불러오기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
