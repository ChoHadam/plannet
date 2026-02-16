'use client';

import { useState, useEffect } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { extractGroupedActionPlans, GroupedActionPlans } from '@/lib/mandalartIntegration';

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

  const availableSlots = 5 - currentGoalsCount;

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

  const togglePlan = (planId: string, planText: string) => {
    const newSelected = new Set(selectedPlans);
    if (newSelected.has(planId)) {
      newSelected.delete(planId);
    } else {
      // 최대 슬롯 제한
      if (newSelected.size < availableSlots) {
        newSelected.add(planId);
      }
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

    // 선택된 실천 계획 텍스트 수집
    const selectedTexts: string[] = [];
    groupedPlans.forEach(group => {
      group.actionPlans.forEach(plan => {
        if (selectedPlans.has(plan.id)) {
          selectedTexts.push(plan.text);
        }
      });
    });

    importActionPlans(selectedTexts, selectedMandalartId || undefined);
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
          ) : groupedPlans.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>실천 계획이 없습니다.</p>
              <p className="text-sm mt-2">만다라트에 세부 목표와 실천 계획을 입력해주세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
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
                        const isSelected = selectedPlans.has(plan.id);
                        const isDisabled = !isSelected && selectedPlans.size >= availableSlots;

                        return (
                          <label
                            key={plan.id}
                            className={`
                              flex items-center gap-3 px-4 py-2 cursor-pointer
                              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}
                            `}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePlan(plan.id, plan.text)}
                              disabled={isDisabled}
                              className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600 flex-1">
                              {plan.text}
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
          {/* Slot warning */}
          <div className="mb-3 text-xs text-slate-500">
            {availableSlots === 0 ? (
              <span className="text-amber-600">
                목표가 이미 5개입니다. 더 이상 추가할 수 없습니다.
              </span>
            ) : (
              <>
                현재 {currentGoalsCount}개 목표.
                <span className="font-medium"> 최대 {availableSlots}개</span> 더 불러올 수 있습니다.
                {selectedPlans.size > 0 && (
                  <span className="text-blue-500"> ({selectedPlans.size}개 선택됨)</span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleImport}
              disabled={selectedPlans.size === 0}
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
