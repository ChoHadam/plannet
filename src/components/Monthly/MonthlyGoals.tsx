'use client';

import { useState, useRef } from 'react';
import { MonthlyGoal } from '@/types/monthly';
import { useMonthlyStore } from '@/hooks/useMonthly';
import { MONTHLY_COLORS } from '@/lib/constants';
import { ImportGoalsModal } from './ImportGoalsModal';

interface MonthlyGoalsProps {
  goals: MonthlyGoal[];
}

export function MonthlyGoals({ goals }: MonthlyGoalsProps) {
  const [newGoalText, setNewGoalText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [syncPromptGoal, setSyncPromptGoal] = useState<MonthlyGoal | null>(null);

  const addGoal = useMonthlyStore((state) => state.addGoal);
  const updateGoal = useMonthlyStore((state) => state.updateGoal);
  const updateGoalProgress = useMonthlyStore((state) => state.updateGoalProgress);
  const toggleGoalCompleted = useMonthlyStore((state) => state.toggleGoalCompleted);
  const deleteGoal = useMonthlyStore((state) => state.deleteGoal);

  // 만다라트에서 가져온 항목은 토글할 때마다 동기화 여부를 묻는다.
  // 결정을 영구 저장하면 "한 번 정하면 끝"이라 사용자가 다시 묻고 싶을 때 방법이 없음 → 매번 묻기.
  const handleToggleCompleted = (goal: MonthlyGoal) => {
    if (goal.sourceMandalartId && goal.sourceCellId) {
      setSyncPromptGoal(goal);
      return;
    }
    toggleGoalCompleted(goal.id);
  };

  const handleSyncDecision = (sync: boolean) => {
    if (syncPromptGoal) {
      toggleGoalCompleted(syncPromptGoal.id, sync);
      setSyncPromptGoal(null);
    }
  };

  const handleAddGoal = () => {
    if (newGoalText.trim()) {
      addGoal(newGoalText.trim());
      setNewGoalText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleAddGoal();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, goalId: string) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      updateGoal(goalId, editText);
      setEditingId(null);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const startEditing = (goal: MonthlyGoal) => {
    setEditingId(goal.id);
    setEditText(goal.text);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">
          이달의 목표
        </h3>
        <span className="text-xs text-slate-400">{goals.length}개</span>
      </div>

      {/* Goals list */}
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalItem
            key={goal.id}
            goal={goal}
            isEditing={editingId === goal.id}
            editText={editText}
            onEditTextChange={setEditText}
            onEditKeyDown={(e) => handleEditKeyDown(e, goal.id)}
            onStartEditing={() => startEditing(goal)}
            onCancelEditing={() => setEditingId(null)}
            onToggleCompleted={() => handleToggleCompleted(goal)}
            onUpdateProgress={(progress) => updateGoalProgress(goal.id, progress)}
            onDelete={() => deleteGoal(goal.id)}
          />
        ))}

        {goals.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">
            이달의 목표를 추가해보세요
          </p>
        )}
      </div>

      {/* Add goal input */}
      <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGoalText}
              onChange={(e) => setNewGoalText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="새 목표 추가..."
              className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <button
              onClick={handleAddGoal}
              disabled={!newGoalText.trim()}
              className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              추가
            </button>
          </div>
          {/* Import from Mandalart button */}
          <button
            onClick={() => setShowImportModal(true)}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            만다라트에서 불러오기
          </button>
        </div>

      {/* Import Goals Modal */}
      <ImportGoalsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        currentGoalsCount={goals.length}
      />

      {/* Mandalart sync confirmation modal */}
      {syncPromptGoal && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setSyncPromptGoal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              만다라트도 함께 완료할까요?
            </h3>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-medium text-slate-700">{syncPromptGoal.text}</span>
            </p>
            <p className="text-sm text-slate-500 mb-6">
              이 목표는 만다라트에서 불러온 항목입니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleSyncDecision(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
              >
                월간만 완료
              </button>
              <button
                onClick={() => handleSyncDecision(true)}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium"
              >
                둘 다 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GoalItemProps {
  goal: MonthlyGoal;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onToggleCompleted: () => void;
  onUpdateProgress: (progress: number) => void;
  onDelete: () => void;
}

function GoalItem({
  goal,
  isEditing,
  editText,
  onEditTextChange,
  onEditKeyDown,
  onStartEditing,
  onCancelEditing,
  onToggleCompleted,
  onUpdateProgress,
  onDelete,
}: GoalItemProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.round((x / rect.width) * 100);
      onUpdateProgress(percentage);
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleProgressClick(e);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleProgressClick(e);
    }
  };

  const handleProgressMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="group">
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <button
          onClick={onToggleCompleted}
          className={`
            mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0
            flex items-center justify-center transition-colors
            ${goal.completed
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-slate-300 hover:border-slate-400'}
          `}
        >
          {goal.completed && (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
        </button>

        {/* Goal text */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onKeyDown={onEditKeyDown}
              onBlur={onCancelEditing}
              autoFocus
              className="w-full text-sm px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          ) : (
            <span
              onClick={onStartEditing}
              className={`
                text-sm cursor-text block
                ${goal.completed ? 'line-through text-slate-400' : 'text-slate-700'}
              `}
            >
              {goal.text}
            </span>
          )}

          {/* Progress bar */}
          {!goal.completed && (
            <div
              ref={progressBarRef}
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              onMouseMove={handleProgressMouseMove}
              onMouseUp={handleProgressMouseUp}
              onMouseLeave={handleProgressMouseUp}
              className="mt-2 h-2 bg-slate-100 rounded-full cursor-pointer overflow-hidden"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${goal.progress}%`,
                  backgroundColor: goal.progress === 100
                    ? MONTHLY_COLORS.goalComplete
                    : MONTHLY_COLORS.goalProgress,
                }}
              />
            </div>
          )}

          {/* Progress percentage */}
          {!goal.completed && (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-slate-400">{goal.progress}%</span>
              <div className="flex gap-1">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => onUpdateProgress(p)}
                    className={`
                      text-[10px] px-1.5 py-0.5 rounded
                      ${goal.progress >= p
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}
                    `}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}
