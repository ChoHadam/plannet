'use client';

import { useState } from 'react';
import { useMandalartStore } from '@/hooks/useMandalart';

export function Header() {
  const { data, updateTitle, resetAll } = useMandalartStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    resetAll();
    setShowResetConfirm(false);
  };

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
            <p className="text-sm text-slate-400 mt-1 text-center sm:text-left">
              클릭하여 목표를 입력하세요
            </p>
          </div>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="
              px-4 py-2 rounded-lg
              bg-slate-100 text-slate-600
              hover:bg-red-50 hover:text-red-600
              transition-colors duration-200
              text-sm font-medium
            "
          >
            초기화
          </button>
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
    </>
  );
}
