'use client';

import { useState } from 'react';

export interface WeeklyImportItem {
  cellId: string;
  text: string;
  blockKeyword: string;
  alreadyImported: boolean;
}

interface WeeklyImportModalProps {
  onClose: () => void;
  items: WeeklyImportItem[];
  onImport: (items: Array<{ text: string; cellId: string }>) => void;
}

export function WeeklyImportModal({ onClose, items, onImport }: WeeklyImportModalProps) {
  const importable = items.filter((it) => !it.alreadyImported);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(importable.map((it) => it.cellId))
  );
  const alreadyCount = items.length - importable.length;

  const allSelected = importable.length > 0 && importable.every((it) => selected.has(it.cellId));

  const toggle = (cellId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(importable.map((it) => it.cellId)));
  };

  const handleImport = () => {
    const picked = importable.filter((it) => selected.has(it.cellId));
    if (picked.length === 0) return;
    onImport(picked.map((it) => ({ text: it.text, cellId: it.cellId })));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">주간 블럭 불러오기</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Select all */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={importable.length === 0}
              className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500 disabled:opacity-40"
            />
            <span className="text-sm font-medium text-slate-700">전체 선택</span>
          </label>
          {alreadyCount > 0 && (
            <span className="text-xs text-slate-400">이미 추가된 {alreadyCount}개 제외</span>
          )}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">불러올 블럭 항목이 없습니다.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((it) => {
                const isSelected = selected.has(it.cellId);
                return (
                  <label
                    key={it.cellId}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                      it.alreadyImported ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={it.alreadyImported ? true : isSelected}
                      disabled={it.alreadyImported}
                      onChange={() => toggle(it.cellId)}
                      className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500 disabled:opacity-50"
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm block truncate ${
                          it.alreadyImported ? 'text-slate-400 line-through' : 'text-slate-700'
                        }`}
                      >
                        {it.text}
                      </span>
                      {it.blockKeyword && (
                        <span className="text-xs text-slate-400">{it.blockKeyword}</span>
                      )}
                    </div>
                    {it.alreadyImported && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 flex-shrink-0">
                        추가됨
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleImport}
            disabled={selected.size === 0}
            className="px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {selected.size}개 불러오기
          </button>
        </div>
      </div>
    </div>
  );
}
