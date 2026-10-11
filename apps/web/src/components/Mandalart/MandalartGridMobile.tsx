'use client';

import { useEffect, useRef, useState } from 'react';
import { Cell } from './Cell';
import { SubGrid } from './SubGrid';
import { CellSchedulePopover } from './CellSchedulePopover';
import { ColorPicker } from '../ColorPicker';
import { EmojiPickerWrapper } from '../EmojiPicker';
import { useMandalartStore } from '@/hooks/useMandalart';
import { GridPosition, CENTER_TO_OUTER_MAP } from '@/types/mandalart';
import { FOCUS_RING, TOUCH_TARGET } from '@/lib/constants';

const DETAIL_ID = 'mandalart-mobile-detail';
const SUB_GOAL_ORDER = [0, 1, 2, 3, 5, 6, 7, 8];

const cellLabel = (index: number) =>
  index === 4 ? '핵심 목표' : `하위 목표 ${SUB_GOAL_ORDER.indexOf(index) + 1}`;

/**
 * 만다라트의 모바일 전용 'Focus + Detail' 레이아웃.
 * - 상단: 중앙 9칸 개요.
 *   - 정중앙 핵심 목표는 실천 계획이 없으므로 펼치지 않고 늘 그 자리 입력 칸이다(이모지·초기화 도구 포함, 색상은 개요 아래 버튼).
 *   - 하위 목표 중 글자가 있는 칸은 버튼이라 눌러도 키보드가 뜨지 않는다. 누르면 아래 상세(외곽 그리드)가 펼쳐지고
 *     그 위치로 스크롤된다(같은 칸을 다시 눌러도). 상세의 가운데 칸 = 하위 목표, 비어 있어도 입력 가능.
 *   - 글자가 없는 하위 목표 칸(공백만·이모지만 포함)은 그 자리 입력 칸이라 첫 탭에 바로 입력한다. 입력하는 동안(초점이 있는 동안)은
 *     글자가 생겨도 입력 칸으로 남고, 초점이 빠지면 버튼이 된다. 입력 중에는 펼치거나 스크롤하지 않는다.
 *
 * 데스크탑 MandalartGrid와는 별개 컴포넌트로 분리해 한쪽 변경이 다른 쪽에 영향 없도록 함.
 * Store action들은 동일하게 재사용. 플랜이 바뀌면 부모가 key로 다시 만들어 선택을 비운다.
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

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // 개요에서 입력 중인 칸. 첫 글자로 버튼으로 바뀌어 입력 칸이 다시 만들어지지(초점·조합 유실) 않게 초점이 빠질 때까지 유지한다.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // 칸을 직접 고를 때만 올린다. 입력·저장으로 다시 그려질 때는 그대로라 스크롤하지 않는다.
  const [scrollRequest, setScrollRequest] = useState(0);
  const [selectedGrid, setSelectedGrid] = useState<GridPosition | null>(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<{ gridId: GridPosition; cellIndex: number } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ gridId: GridPosition; cellIndex: number } | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const overviewRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (scrollRequest === 0) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detailRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [scrollRequest]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 px-4 text-center text-sm">
        사이드바에서 플랜을 선택하거나 새로 만들어주세요
      </div>
    );
  }

  const getGrid = (position: GridPosition) => data.grids.find((g) => g.id === position);
  const centerGrid = getGrid('center');

  const select = (index: number) => {
    setSelectedIndex(index);
    setScrollRequest((n) => n + 1);
  };

  // 닫으면 그 칸 버튼으로 초점을 돌린다(버튼이라 키보드는 뜨지 않는다). 그 사이 비어 입력 칸이 됐으면 초점을 주지 않는다.
  const closeDetail = () => {
    if (selectedIndex !== null) overviewRefs.current[selectedIndex]?.focus();
    setSelectedIndex(null);
  };

  const selectedOuterGrid = selectedIndex !== null ? getGrid(CENTER_TO_OUTER_MAP[selectedIndex]) : null;
  const selectedGoal = selectedIndex !== null ? centerGrid?.cells[selectedIndex] : undefined;
  const isOuterEnabled = !!selectedGoal?.value?.trim();

  // 상세 외곽 그리드의 가운데 칸은 개요에 보이는 중앙 하위 목표 칸을 그대로 편집한다
  // (글자는 스토어가 외곽 가운데와 동기화, 이모지·완료·초기화도 개요와 같은 칸).
  const detailTarget = (gridId: GridPosition, cellIndex: number): [GridPosition, number] =>
    cellIndex === 4 && selectedIndex !== null ? ['center', selectedIndex] : [gridId, cellIndex];
  const detailCells =
    selectedOuterGrid && selectedGoal
      ? selectedOuterGrid.cells.map((cell, index) =>
        index === 4 ? { ...cell, value: selectedGoal.value, icon: selectedGoal.icon, completed: selectedGoal.completed } : cell)
      : [];

  const hint = isOuterEnabled
    ? '가운데 칸은 하위 목표, 주변 8칸은 실천 계획입니다'
    : '가운데 칸에 하위 목표를 입력하면 주변 8칸이 열립니다';

  return (
    <div id="mandalart-grid-mobile" className="w-full max-w-screen-md mx-auto px-2 flex flex-col gap-3">
      {/* 안내 */}
      <p className="text-xs text-slate-400 text-center">
        핵심 목표와 빈 칸은 눌러 바로 입력하고, 채운 하위 목표는 누르면 아래에 실천 계획이 펼쳐집니다
      </p>

      {/* 중앙 9칸 개요 */}
      {centerGrid && (
        <div className="bg-slate-100/50 rounded-2xl p-3 shadow-inner">
          <div
            className="grid grid-cols-3 gap-1 p-1 rounded-lg ring-2 ring-amber-400/50 shadow-xl"
            style={{ backgroundColor: centerGrid.color }}
          >
            {centerGrid.cells.map((cell, index) => {
              const isMainGoal = index === 4;
              const selected = index === selectedIndex;
              const label = cellLabel(index);
              const value = cell.value.trim();
              const cellColor = isMainGoal ? centerGrid.color : getGrid(CENTER_TO_OUTER_MAP[index])?.color ?? centerGrid.color;
              if (isMainGoal || !value || editingIndex === index) {
                return (
                  <div
                    key={cell.id}
                    className="relative"
                    onFocus={() => setEditingIndex(index)}
                    onBlur={() => setEditingIndex((current) => (current === index ? null : current))}
                  >
                    {/* 이모지가 있어도 글자는 입력 칸(이모지는 장식). 핵심 목표는 이모지·초기화 도구도 여기 둔다 */}
                    <Cell
                      value={cell.value}
                      onChange={(next) => updateCell('center', index, next)}
                      isMainGoal={isMainGoal}
                      isSubGoal={!isMainGoal}
                      backgroundColor={cellColor}
                      placeholder={isMainGoal ? '핵심 목표' : '하위 목표'}
                      ariaLabel={label}
                      icon={cell.icon}
                      keepTextEditable
                      onIconClick={isMainGoal ? () => setEmojiPickerTarget({ gridId: 'center', cellIndex: 4 }) : undefined}
                      onClearCell={isMainGoal ? () => clearCell('center', 4) : undefined}
                    />
                  </div>
                );
              }
              return (
                <button
                  key={cell.id}
                  ref={(el) => { overviewRefs.current[index] = el; }}
                  type="button"
                  onClick={() => select(index)}
                  aria-expanded={selected}
                  aria-controls={DETAIL_ID}
                  aria-label={`${label}: ${value}`}
                  className={`
                    relative aspect-square p-1.5 rounded-md
                    flex flex-col items-center justify-center gap-0.5
                    border border-slate-200/50 text-center
                    transition-shadow duration-200
                    ${selected
                      ? 'ring-[3px] ring-slate-800 shadow-lg z-10'
                      : 'ring-1 ring-slate-300'}
                    ${FOCUS_RING}
                  `}
                  style={{ backgroundColor: cellColor }}
                >
                  {cell.icon && (
                    <span className="text-xl" aria-hidden="true">{cell.icon}</span>
                  )}
                  <span
                    className={`
                      max-w-full line-clamp-3 break-words leading-tight
                      text-xs font-bold text-slate-600
                      ${cell.completed ? 'line-through opacity-50' : ''}
                    `}
                  >
                    {value}
                  </span>
                </button>
              );
            })}
          </div>
          {/* 중앙 그리드(핵심 목표) 색상. 칸 도구와 겹치지 않게 개요 아래에 둔다 */}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={() => setSelectedGrid('center')}
              aria-label="중앙 그리드 색상 변경"
              className={`flex items-center gap-1.5 px-3 h-8 ${TOUCH_TARGET} rounded-full bg-white border border-slate-200 text-xs text-slate-600 shadow-sm hover:bg-slate-50 ${FOCUS_RING}`}
            >
              <span className="grid grid-cols-2 gap-0.5" aria-hidden="true">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </span>
              색상
            </button>
          </div>
        </div>
      )}

      {/* 선택한 하위 목표의 상세(실천 계획) */}
      {selectedIndex !== null && centerGrid && (
        <section
          ref={detailRef}
          id={DETAIL_ID}
          aria-label={`${cellLabel(selectedIndex)} 상세`}
          className="scroll-mt-3 bg-slate-100/50 rounded-2xl p-3 shadow-inner"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-700">{cellLabel(selectedIndex)} · 실천 계획</p>
              <p className="text-xs text-slate-500">{hint}</p>
            </div>
            <button
              type="button"
              onClick={closeDetail}
              className={`relative touch-hit ml-2 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white ${FOCUS_RING}`}
              title="닫기"
              aria-label="상세 닫기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {selectedOuterGrid && (
            <SubGrid
              gridId={selectedOuterGrid.id}
              cells={detailCells}
              color={selectedOuterGrid.color}
              onCellChange={(cellIndex, value) => updateCell(...detailTarget(selectedOuterGrid.id, cellIndex), value)}
              onToggleCellCompleted={(cellIndex) => toggleCellCompleted(...detailTarget(selectedOuterGrid.id, cellIndex))}
              onIconClick={(cellIndex) => {
                const [gridId, index] = detailTarget(selectedOuterGrid.id, cellIndex);
                setEmojiPickerTarget({ gridId, cellIndex: index });
              }}
              onClearCell={(cellIndex) => clearCell(...detailTarget(selectedOuterGrid.id, cellIndex))}
              onScheduleClick={(cellIndex) => setScheduleTarget({ gridId: selectedOuterGrid.id, cellIndex })}
              onColorClick={() => setSelectedGrid(selectedOuterGrid.id)}
              disabled={!isOuterEnabled}
              editableCellIndex={4}
            />
          )}
        </section>
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
