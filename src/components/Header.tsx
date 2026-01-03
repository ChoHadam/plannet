'use client';

import { useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';
import { exportToJSON, importFromJSON, exportToImage } from '@/lib/export';
import { MandalartData } from '@/types/mandalart';

export function Header() {
  const data = useMandalartStore((state) => {
    if (!state.currentId) return null;
    return state.mandalarts.find(m => m.id === state.currentId) || null;
  });
  const updateTitle = useMandalartStore((state) => state.updateTitle);
  const resetCurrent = useMandalartStore((state) => state.resetCurrent);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<MandalartData | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // 현재 플랜이 비어있는지 체크
  const isCurrentPlanEmpty = () => {
    if (!data) return true;
    return data.grids.every(grid =>
      grid.cells.every(cell => !cell.value.trim())
    ) && !data.title.trim();
  };

  const handleReset = () => {
    resetCurrent();
    setShowResetConfirm(false);
  };

  const handleExportJSON = () => {
    if (data) {
      exportToJSON(data);
    }
    setShowMenu(false);
  };

  const handleImportJSON = async () => {
    setShowMenu(false);
    const importedData = await importFromJSON();
    if (importedData && data) {
      if (isCurrentPlanEmpty()) {
        // 비어있으면 바로 덮어쓰기
        applyImport(importedData);
      } else {
        // 비어있지 않으면 확인 모달
        setPendingImport(importedData);
        setShowImportConfirm(true);
      }
    }
  };

  const applyImport = (importedData: MandalartData) => {
    if (!data) return;

    const store = useMandalartStore.getState();
    const idx = store.mandalarts.findIndex(m => m.id === data.id);
    if (idx !== -1) {
      // 현재 플랜의 id, category 유지, 나머지 덮어쓰기
      store.mandalarts[idx] = {
        ...importedData,
        id: data.id,
        category: data.category,
        updatedAt: new Date().toISOString(),
      };
      // 강제 리렌더링을 위해 state 업데이트
      useMandalartStore.setState({ mandalarts: [...store.mandalarts] });
    }
  };

  const handleConfirmImport = () => {
    if (pendingImport) {
      applyImport(pendingImport);
    }
    setPendingImport(null);
    setShowImportConfirm(false);
  };

  const handleExportImage = () => {
    if (data) {
      exportToImage('mandalart-grid', data.title || 'mandalart');
    }
    setShowMenu(false);
  };

  if (!data) return null;

  return (
    <>
      <header className="w-full max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={data.title}
              onChange={(e) => updateTitle(e.target.value)}
              placeholder="나의 만다라트"
              className="
                text-2xl sm:text-3xl font-bold text-slate-800
                bg-transparent border-none outline-none
                placeholder:text-slate-300
                text-center sm:text-left
                w-full
              "
            />
          </div>

          {/* Menu Button */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="
                p-2 rounded-lg
                bg-slate-100 text-slate-600
                hover:bg-slate-200
                transition-colors duration-200
              "
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
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50 py-1">
                  <div className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase">저장</div>
                  <button
                    onClick={handleExportJSON}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    JSON 저장
                  </button>
                  <button
                    onClick={handleExportImage}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    이미지 저장
                  </button>

                  <div className="border-t border-slate-100 my-1"></div>
                  <div className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase">불러오기</div>
                  <button
                    onClick={handleImportJSON}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    JSON 불러오기
                  </button>

                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    onClick={() => { setShowMenu(false); setShowResetConfirm(true); }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"></polyline>
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    초기화
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              정말 초기화하시겠습니까?
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              모든 데이터가 삭제되며 복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
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
                onClick={handleReset}
                className="
                  flex-1 px-4 py-2 rounded-lg
                  bg-red-500 text-white
                  hover:bg-red-600
                  transition-colors duration-200
                  font-medium
                "
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              현재 플랜을 덮어쓰시겠습니까?
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              기존 내용이 불러온 파일의 내용으로 대체됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowImportConfirm(false); setPendingImport(null); }}
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
                onClick={handleConfirmImport}
                className="
                  flex-1 px-4 py-2 rounded-lg
                  bg-blue-500 text-white
                  hover:bg-blue-600
                  transition-colors duration-200
                  font-medium
                "
              >
                덮어쓰기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
