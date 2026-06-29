'use client';

import { useState } from 'react';
import { SubGrid } from './SubGrid';
import { CellSchedulePopover } from './CellSchedulePopover';
import { ColorPicker } from '../ColorPicker';
import { EmojiPickerWrapper } from '../EmojiPicker';
import { useMandalartStore } from '@/hooks/useMandalart';
import { GridPosition, CENTER_TO_OUTER_MAP } from '@/types/mandalart';

/**
 * 만다라트의 모바일 전용 'Focus + Detail' 레이아웃.
 * - 상단: 중앙 그리드 풀폭 (핵심 목표 + 8개 서브 목표)
 * - 중앙 서브 목표 셀 탭 → 그 아래에 해당 외곽 그리드 풀폭으로 표시
 * - 선택된 서브 목표는 시각적으로 강조
 *
 * 데스크탑 MandalartGrid와는 별개 컴포넌트로 분리해 한쪽 변경이 다른 쪽에 영향 없도록 함.
 * Store action들은 동일하게 재사용.
 */
export function MandalartGridMobile() {
  const data = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find((m) => m.id === state.currentId) || null;
  });
  const updateCell = useMandalartStore((state) => state.updateCell);
  const updateCellIcon = useMandalartStore((state) => state.updateCellIcon);
  const toggleCellCompleted = useMandalartStore((state) => state.toggleCellCompleted);
  const clearCell = useMandalartStore((state) => state.clearCell);
  const updateCellSchedule = useMandalartStore((state) => state.updateCellSchedule);
  const updateGridColor = useMandalartStore((state) => state.updateGridColor);

  const [selectedSubGoalIndex, setSelectedSubGoalIndex] = useState<number | null>(null);
  const [selectedGrid, setSelectedGrid] = useState<GridPosition | null>(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<{ gridId: GridPosition; cellIndex: number } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ gridId: GridPosition; cellIndex: number } | null>(null);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 px-4 text-center text-sm">
        사이드바에서 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const getGrid = (position: GridPosition) => data.grids.find((g) => g.id === position);
  const centerGrid = getGrid('center');

  // 외곽 그리드 색상 → 중앙 셀에 매핑
  const getCenterGridCellColors = (): Record<number, string> => {
    const colors: Record<number, string> = {};
    [0, 1, 2, 3, 5, 6, 7, 8].forEach((cellIndex) => {
      const outerGridId = CENTER_TO_OUTER_MAP[cellIndex];
      const outerGrid = data.grids.find((g) => g.id === outerGridId);
      if (outerGrid) colors[cellIndex] = outerGrid.color;
    });
    return colors;
  };

  const selectedOuterGridId =
    selectedSubGoalIndex !== null ? CENTER_TO_OUTER_MAP[selectedSubGoalIndex] : null;
  const selectedOuterGrid = selectedOuterGridId ? getGrid(selectedOuterGridId) : null;
  const selectedSubGoalText =
    selectedSubGoalIndex !== null ? centerGrid?.cells[selectedSubGoalIndex]?.value || '' : '';

  // 외곽 그리드가 활성화될 조건: 중앙 셀에 텍스트가 있어야 함
  const isOuterEnabled =
    selectedSubGoalIndex !== null &&
    !!centerGrid?.cells[selectedSubGoalIndex]?.value?.trim();

  return (
    <div className="w-full max-w-screen-md mx-auto px-2 flex flex-col gap-3">
      {/* 안내 */}
      <p className="text-xs text-slate-400 text-center">
        중앙의 셀을 탭하면 해당 영역의 실천 계획이 아래에 펼쳐집니다
      </p>

      {/* 중앙 그리드 */}
      <div id="mandalart-grid" className="bg-slate-100/50 rounded-2xl p-3 shadow-inner">
        {centerGrid && (
          <SubGrid
            gridId="center"
            cells={centerGrid.cells}
            color={centerGrid.color}
            cellColors={getCenterGridCellColors()}
            onCellChange={(cellIndex, value) => updateCell('center', cellIndex, value)}
            onToggleCellCompleted={(cellIndex) => toggleCellCompleted('center', cellIndex)}
            onIconClick={(cellIndex) => setEmojiPickerTarget({ gridId: 'center', cellIndex })}
            onClearCell={(cellIndex) => clearCell('center', cellIndex)}
            onScheduleClick={(cellIndex) => setScheduleTarget({ gridId: 'center', cellIndex })}
            onColorClick={() => setSelectedGrid('center')}
            isCenter
            disabled={false}
            // 중앙의 서브 목표 셀(0~3, 5~8)을 탭하면 해당 외곽 그리드로 선택 전환
            onCellTap={(cellIndex) => {
              if (cellIndex !== 4) setSelectedSubGoalIndex(cellIndex);
            }}
          />
        )}
      </div>

      {/* 선택된 외곽 그리드 */}
      {selectedSubGoalIndex !== null && (
        <div className="bg-slate-100/50 rounded-2xl p-3 shadow-inner">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">실천 계획</p>
              <p className="text-sm font-bold text-slate-700 truncate">
                {selectedSubGoalText || '하위 목표 미입력'}
              </p>
            </div>
            <button
              onClick={() => setSelectedSubGoalIndex(null)}
              className="ml-2 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white"
              title="닫기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {selectedOuterGrid && (
            <SubGrid
              gridId={selectedOuterGrid.id}
              cells={selectedOuterGrid.cells}
              color={selectedOuterGrid.color}
              onCellChange={(cellIndex, value) => updateCell(selectedOuterGrid.id, cellIndex, value)}
              onToggleCellCompleted={(cellIndex) => toggleCellCompleted(selectedOuterGrid.id, cellIndex)}
              onIconClick={(cellIndex) => setEmojiPickerTarget({ gridId: selectedOuterGrid.id, cellIndex })}
              onClearCell={(cellIndex) => clearCell(selectedOuterGrid.id, cellIndex)}
              onScheduleClick={(cellIndex) => setScheduleTarget({ gridId: selectedOuterGrid.id, cellIndex })}
              onColorClick={() => setSelectedGrid(selectedOuterGrid.id)}
              disabled={!isOuterEnabled}
            />
          )}
        </div>
      )}

      {/* Color Picker Modal */}
      {selectedGrid && (
        <ColorPicker
          currentColor={getGrid(selectedGrid)?.color || ''}
          onSelect={(color) => updateGridColor(selectedGrid, color)}
          onClose={() => setSelectedGrid(null)}
        />
      )}

      {/* Emoji Picker Modal */}
      {emojiPickerTarget && (
        <EmojiPickerWrapper
          currentEmoji={getGrid(emojiPickerTarget.gridId)?.cells[emojiPickerTarget.cellIndex]?.icon}
          onSelect={(emoji) => updateCellIcon(emojiPickerTarget.gridId, emojiPickerTarget.cellIndex, emoji)}
          onClose={() => setEmojiPickerTarget(null)}
        />
      )}

      {/* Schedule Popover */}
      {scheduleTarget && (
        <CellSchedulePopover
          schedule={getGrid(scheduleTarget.gridId)?.cells[scheduleTarget.cellIndex]?.schedule}
          onSave={(schedule) => {
            updateCellSchedule(scheduleTarget.gridId, scheduleTarget.cellIndex, schedule);
            setScheduleTarget(null);
          }}
          onClose={() => setScheduleTarget(null)}
        />
      )}
    </div>
  );
}
