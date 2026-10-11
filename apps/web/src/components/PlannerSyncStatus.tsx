'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { authUserKey } from '@/lib/authContract';
import { downloadText, findLegacyUnsentDrafts } from '@/lib/legacyBrowserDrafts';
import { accountStorageScope, LOCAL_STORAGE_SCOPE } from '@/lib/plannerStorage';
import { hasLegacyDocuments, readLegacyDocuments } from '@/lib/plannerSyncStores';
import { getPlannerSync, usePlannerSyncStatus } from '@/hooks/usePlannerSync';
import { RefreshStatus } from '@/lib/plannerSync';

const ACTION_CLASS = 'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50';
const DANGER_CLASS = 'rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50';
const today = () => new Date().toISOString().slice(0, 10);

/** 다른 기기 변경 확인 결과. 관찰하지 않은 변경을 있다고 말하지 않는다. */
function refreshMessage({ state, reason, changed, selectionRemoved }: RefreshStatus): string | null {
  const found = '다른 기기에서 바뀐 내용이 있어요.';
  if (state === 'updated') return selectionRemoved ? '보던 플랜이 다른 기기에서 삭제됐어요. 다른 기기 변경을 반영했어요.' : '다른 기기에서 바뀐 내용을 반영했어요.';
  if (state === 'failed') {
    return reason === 'invalid'
      ? '서버 응답을 확인하지 못해 다른 기기 변경을 반영하지 않았어요. 지금 화면은 그대로예요.'
      : '다른 기기 변경을 확인하지 못했어요. 지금 화면은 마지막으로 불러온 내용이에요.';
  }
  if (state !== 'deferred') return null;
  if (reason === 'editing') return changed ? `${found} 입력을 마치면 반영해요.` : '입력 중이라 다른 기기 변경 확인을 미뤘어요. 입력을 마치면 확인해요.';
  if (reason === 'assistant') return changed ? `${found} AI 도우미를 닫으면 반영해요.` : 'AI 도우미가 열려 있어 다른 기기 변경 확인을 미뤘어요. 닫으면 확인해요.';
  if (reason === 'draft') return '보던 플랜이 다른 기기에서 삭제됐어요. 아직 추가하지 않은 입력이 있어 화면을 그대로 두었어요. 내용을 옮긴 뒤 다시 확인해주세요.';
  if (reason === 'unsaved') return '이 탭의 수정이 저장되면 다른 기기 변경을 확인해요.';
  return '이 탭의 저장 문제를 정리한 뒤 다른 기기 변경을 확인해요.';
}

/**
 * 서버 저장 상태와 복구 동작. 저장 전 수정은 이 탭(메모리 + 새로고침용 임시 보관)에만 있으므로
 * 파일 저장은 항상 사용자가 직접 누를 때만, 수정 버리기는 확인을 거친 뒤에만 한다.
 */
export function PlannerSyncStatus() {
  const { storageEnabled, user } = useAuth();
  const sync = usePlannerSyncStatus();
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  /** 버리기 확인을 연 시점의 초안 revision. 그 뒤 수정이 생기면 useServer가 거부한다. */
  const [confirming, setConfirming] = useState<number | null>(null);
  const [confirmingJournalDiscard, setConfirmingJournalDiscard] = useState(false);
  const sources = useMemo(() => !user || !storageEnabled ? [] : [
    { scope: accountStorageScope(authUserKey(user)), label: '이전 계정 기록 가져오기', testId: 'storage-sync-import-legacy' },
    { scope: LOCAL_STORAGE_SCOPE, label: '로그인 전 기록 가져오기', testId: 'storage-sync-import-local' },
  ].filter(({ scope }) => hasLegacyDocuments(scope)), [user, storageEnabled]);
  const legacyDrafts = useMemo(() => user?.userId && storageEnabled ? findLegacyUnsentDrafts(user.userId) : null, [user, storageEnabled]);
  if (!storageEnabled || !user?.userId) return null;
  const failed = sync.phase === 'error' || sync.phase === 'conflict';
  const refreshText = failed ? null : refreshMessage(sync.refresh);
  const canRecheck = !failed && (sync.refresh.state === 'failed' || (sync.refresh.state === 'deferred' && ['editing', 'assistant', 'draft'].includes(sync.refresh.reason ?? '')));
  const refreshWarning = sync.refresh.state === 'failed' || sync.refresh.reason === 'draft';

  const downloadDraft = () => {
    const text = getPlannerSync()?.backupText();
    if (text) downloadText(text, `plannet-unsaved-${today()}.json`);
  };

  const importSource = (scope: string) => {
    try {
      const result = getPlannerSync()?.importDocuments(readLegacyDocuments(scope));
      if (!result) return;
      if (result.collisions.length) {
        setNotice(`같은 ID의 다른 내용 또는 삭제된 기록 ${result.collisions.length}개가 있어 가져오기를 중단했어요. 원본은 그대로 두었어요. (${result.collisions.slice(0, 3).join(', ')})`);
      } else {
        setNotice(`${result.added}개를 가져왔어요. 같은 내용 ${result.skipped}개는 건너뛰었어요. 서버 저장 상태를 확인해주세요. 원본은 그대로 두었어요.`);
      }
    } catch { setNotice('이전 기록을 가져오지 못했어요. 원본은 그대로 두었어요.'); }
  };

  const retry = async () => {
    setWorking(true);
    try { await getPlannerSync()?.retry(); }
    finally { setWorking(false); }
  };

  /** 수정을 버리지 않는 확인. 보류 조건은 그대로 지킨다. */
  const recheck = async () => {
    setWorking(true);
    try { await getPlannerSync()?.refresh(); }
    finally { setWorking(false); }
  };

  const askUseServer = () => {
    if (!sync.dirty) {
      void loadServer(sync.revision);
      return;
    }
    setConfirming(sync.revision);
  };

  const loadServer = async (revision: number) => {
    setWorking(true);
    try { await getPlannerSync()?.useServer(revision); }
    finally {
      setWorking(false);
      setConfirming(null);
    }
  };

  return (
    <div className="flex max-w-xl flex-col items-end gap-1.5 text-right" data-testid="storage-sync-controls">
      <p role="status" data-testid="storage-sync-status" data-phase={sync.phase} data-dirty={sync.dirty} data-protection={sync.protection} className={`text-xs ${failed ? 'text-amber-700' : 'text-slate-500'}`}>
        {sync.message}
      </p>
      {refreshText && (
        <p data-testid="storage-sync-refresh-status" aria-live="polite" data-state={sync.refresh.state} data-reason={sync.refresh.reason ?? ''} className={`text-xs ${refreshWarning ? 'text-amber-700' : 'text-slate-500'}`}>
          {refreshText}
        </p>
      )}
      {failed && sync.pendingCount > 0 && (
        <p className="text-xs text-amber-700">서버에 저장되지 않은 기록 {sync.pendingCount}개가 남아 있어요. 이 탭을 닫으면 사라져요.</p>
      )}
      <div className="flex flex-wrap justify-end gap-1.5">
        {sources.map(({ scope, label, testId }) => (
          <button key={scope} type="button" data-testid={testId} onClick={() => importSource(scope)} disabled={!sync.ready || failed || working} className={ACTION_CLASS}>{label}</button>
        ))}
        {canRecheck && <button type="button" data-testid="storage-sync-refresh" onClick={() => void recheck()} disabled={working} className={ACTION_CLASS}>다른 기기 변경 확인</button>}
        {sync.dirty && <button type="button" data-testid="storage-sync-download" onClick={downloadDraft} className={ACTION_CLASS}>초안 파일로 저장</button>}
        {failed && <>
          <button type="button" onClick={() => void retry()} disabled={working} className={ACTION_CLASS}>서버 저장 다시 시도</button>
          {sync.loaded && confirming === null && (
            <button type="button" data-testid="storage-sync-use-server" onClick={askUseServer} disabled={working} className={ACTION_CLASS}>서버 내용 불러오기</button>
          )}
        </>}
      </div>
      {confirming !== null && (
        <div role="group" aria-label="서버 내용 불러오기 확인" className="max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-2 text-left">
          <p className="text-xs text-amber-900">
            이 탭에만 있는 수정 {sync.pendingCount}개를 버리고 서버 내용을 불러올까요? 버린 수정은 되돌릴 수 없어요. 필요하면 먼저 초안 파일로 저장하세요.
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <button type="button" onClick={() => setConfirming(null)} disabled={working} className={ACTION_CLASS}>취소</button>
            <button type="button" data-testid="storage-sync-confirm-use-server" onClick={() => void loadServer(confirming)} disabled={working} className={DANGER_CLASS}>수정 버리고 불러오기</button>
          </div>
        </div>
      )}
      {sources.length > 0 && <p className="text-xs text-slate-500">이 브라우저의 이전 기록은 선택해서 계정으로 가져올 수 있어요.</p>}
      {legacyDrafts && (
        <div className="flex max-w-sm flex-col items-end gap-1" data-testid="storage-sync-legacy-drafts">
          <p className="text-xs text-amber-700">
            예전 방식으로 이 브라우저에 남은 미저장 초안이 있어요{legacyDrafts.pendingCount ? ` (${legacyDrafts.pendingCount}개)` : ''}. 자동으로 보내지 않았어요. 파일로 받아 확인해주세요.
          </p>
          <button type="button" data-testid="storage-sync-legacy-download" onClick={() => downloadText(legacyDrafts.text, `plannet-legacy-drafts-${today()}.json`)} className={ACTION_CLASS}>예전 초안 파일로 저장</button>
        </div>
      )}
      {sync.protection === 'unavailable' && (
        <p className="max-w-sm text-xs text-amber-700" data-testid="storage-sync-protection-unavailable">
          새로고침 대비 임시 보관을 쓸 수 없어요. 서버 저장은 계속돼요. 저장이 끝나기 전에는 새로고침하지 마세요.
        </p>
      )}
      {sync.protection === 'invalid' && (
        <div className="flex max-w-sm flex-col items-end gap-1" data-testid="storage-sync-journal-invalid">
          <p className="text-xs text-amber-700">임시 보관된 이전 수정을 읽지 못해 적용하지 않았어요. 파일로 받거나 삭제할 수 있어요. 새로고침 전에는 서버 저장 완료를 확인해주세요.</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button type="button" data-testid="storage-sync-journal-download" onClick={() => {
              const text = getPlannerSync()?.invalidJournalText();
              if (text) downloadText(text, `plannet-pending-${today()}.json`);
            }} className={ACTION_CLASS}>임시 보관 파일로 저장</button>
            {confirmingJournalDiscard ? <>
              <button type="button" onClick={() => setConfirmingJournalDiscard(false)} className={ACTION_CLASS}>취소</button>
              <button type="button" data-testid="storage-sync-journal-discard-confirm" onClick={() => {
                getPlannerSync()?.discardInvalidJournal();
                setConfirmingJournalDiscard(false);
              }} className={DANGER_CLASS}>임시 보관 삭제</button>
            </> : (
              <button type="button" data-testid="storage-sync-journal-discard" onClick={() => setConfirmingJournalDiscard(true)} className={ACTION_CLASS}>삭제…</button>
            )}
          </div>
        </div>
      )}
      {notice && <p role="status" className="text-xs text-slate-600">{notice}</p>}
    </div>
  );
}
