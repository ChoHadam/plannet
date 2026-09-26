'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { authUserKey } from '@/lib/authContract';
import { accountStorageScope, LOCAL_STORAGE_SCOPE } from '@/lib/plannerStorage';
import { hasLegacyDocuments, readLegacyDocuments } from '@/lib/plannerSyncStores';
import { getPlannerSync, usePlannerSyncStatus } from '@/hooks/usePlannerSync';

const ACTION_CLASS = 'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50';

export function PlannerSyncStatus() {
  const { storageEnabled, user } = useAuth();
  const sync = usePlannerSyncStatus();
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const sources = useMemo(() => !user || !storageEnabled ? [] : [
    { scope: accountStorageScope(authUserKey(user)), label: '이전 계정 기록 가져오기', testId: 'storage-sync-import-legacy' },
    { scope: LOCAL_STORAGE_SCOPE, label: '로그인 전 기록 가져오기', testId: 'storage-sync-import-local' },
  ].filter(({ scope }) => hasLegacyDocuments(scope)), [user, storageEnabled]);
  if (!storageEnabled || !user?.userId) return null;
  const failed = sync.phase === 'error' || sync.phase === 'conflict';

  const download = () => {
    const text = getPlannerSync()?.backupText();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `plannet-draft-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importSource = (scope: string) => {
    try {
      const result = getPlannerSync()?.importDocuments(readLegacyDocuments(scope));
      if (!result) return;
      if (result.collisions.length) {
        setNotice(`같은 ID의 다른 내용 또는 삭제된 기록 ${result.collisions.length}개가 있어 가져오기를 중단했어요. 원본은 보관했어요. (${result.collisions.slice(0, 3).join(', ')})`);
      } else {
        setNotice(`${result.added}개를 가져왔어요. 같은 내용 ${result.skipped}개는 건너뛰었어요. 서버 저장 상태를 확인해주세요. 원본은 그대로 보관했어요.`);
      }
    } catch { setNotice('이전 기록을 가져오지 못했어요. 원본은 그대로 보관했어요.'); }
  };

  const run = async (action: 'retry' | 'useServer') => {
    setWorking(true);
    try { await getPlannerSync()?.[action](); }
    finally { setWorking(false); }
  };

  return (
    <div className="flex max-w-xl flex-col items-end gap-1.5 text-right" data-testid="storage-sync-controls">
      <p role="status" data-testid="storage-sync-status" data-phase={sync.phase} className={`text-xs ${failed ? 'text-amber-700' : 'text-slate-500'}`}>
        {sync.message}
      </p>
      {failed && sync.pendingCount > 0 && <p className="text-xs text-amber-700">서버에 저장되지 않은 기록 {sync.pendingCount}개가 남아 있어요.</p>}
      <div className="flex flex-wrap justify-end gap-1.5">
        {sources.map(({ scope, label, testId }) => (
          <button key={scope} type="button" data-testid={testId} onClick={() => importSource(scope)} disabled={!sync.ready || failed || working} className={ACTION_CLASS}>{label}</button>
        ))}
        {(failed || sync.pendingCount > 0) && <button type="button" data-testid="storage-sync-download" onClick={download} className={ACTION_CLASS}>초안 파일로 저장</button>}
        {failed && <>
          <button type="button" onClick={() => void run('retry')} disabled={working} className={ACTION_CLASS}>서버 저장 다시 시도</button>
          <button type="button" data-testid="storage-sync-use-server" onClick={() => void run('useServer')} disabled={working} className={ACTION_CLASS}>초안 보관 후 서버 내용 불러오기</button>
          <button type="button" onClick={() => window.location.reload()} className={ACTION_CLASS}>새로고침</button>
        </>}
      </div>
      {sources.length > 0 && <p className="text-xs text-slate-500">이 브라우저의 이전 기록은 선택해서 계정으로 가져올 수 있어요.</p>}
      {notice && <p role="status" className="text-xs text-slate-600">{notice}</p>}
    </div>
  );
}
