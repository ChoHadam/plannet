'use client';

import { useEffect, useState } from 'react';
import {
  applyBackup,
  BackupItem,
  getAutoBackupEnabled,
  listBackups,
  loadBackup,
  setAutoBackupEnabled,
} from '@/lib/autoBackup';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}초 전`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function BackupRestoreModal({ isOpen, onClose }: BackupRestoreModalProps) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<BackupItem | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    listBackups()
      .then((items) => setBackups(items))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async () => {
    if (!confirmTarget) return;
    const snap = await loadBackup(confirmTarget.filename);
    if (snap) {
      applyBackup(snap);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">백업 복원</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700">이 브라우저에서 자동 백업</div>
              <div className="mt-1 text-xs text-slate-500">
                새 브라우저에서는 기본으로 꺼져 있습니다. 꺼도 목록 조회와 수동 복원은 사용할 수 있습니다.
              </div>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label="이 브라우저에서 자동 백업"
              defaultChecked={getAutoBackupEnabled()}
              onChange={(event) => setAutoBackupEnabled(event.currentTarget.checked)}
              className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:bg-blue-500 checked:before:translate-x-5"
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            켜면 데이터 변경 후 자동으로 백업합니다. 복원은 아래 목록에서 원하는 시점을 직접 선택하며, 백업은 최근 20개를 보관합니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">백업이 아직 없습니다</div>
          ) : (
            <div className="space-y-1">
              {backups.map((b, idx) => (
                <button
                  key={b.filename}
                  onClick={() => setConfirmTarget(b)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-slate-700">
                      {formatTimestamp(b.createdAt)}
                      {idx === 0 && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          최신
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatRelativeTime(b.createdAt)} · {(b.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmTarget && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-2">정말 복원하시겠습니까?</h3>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-medium text-slate-700">{formatTimestamp(confirmTarget.createdAt)}</span> 시점으로 되돌립니다.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              현재 데이터는 덮어쓰여집니다. 자동 백업이 켜져 있으면 이후 변경 사항부터 다시 백업됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleRestore}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium"
              >
                복원
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
