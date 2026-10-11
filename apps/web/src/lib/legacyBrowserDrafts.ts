import { legacySyncStorageKey } from '@/lib/plannerSync';
import { legacyCloudStorageScope, PLANNER_STORAGE_KEYS, scopedKey } from '@/lib/plannerStorage';

/**
 * 예전 설계(브라우저 영구 캐시)가 남긴 같은 계정의 미전송 초안을 **읽기만** 한다.
 * 자동으로 재전송하거나 가져오지 않는다: 오래된 기준 버전으로 새 DB 기록을 덮을 수 있기 때문이다.
 * 사용자가 파일로 받아 직접 확인하게 하고, 원본 키는 지우거나 바꾸지 않는다.
 */
export interface LegacyDraftBundle {
  /** 찾은 원본 키 (파일에 원문 그대로 담는다) */
  keys: string[];
  /** 미전송 초안·요청 수. 형식을 읽지 못하면 null */
  pendingCount: number | null;
  text: string;
}

type ReadableStorage = Pick<Storage, 'getItem' | 'key' | 'length'>;

function pendingIn(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as { drafts?: unknown[]; inflight?: { changes?: unknown[] } | null };
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.length : 0;
    const inflight = Array.isArray(parsed.inflight?.changes) ? parsed.inflight!.changes!.length : 0;
    return drafts + inflight;
  } catch {
    return null;
  }
}

export function findLegacyUnsentDrafts(userId: string, storage?: ReadableStorage): LegacyDraftBundle | null {
  try {
    // Access itself can throw when browser storage is disabled, before getItem is called.
    storage ??= localStorage;
    const envelopeKey = legacySyncStorageKey(userId);
    const entries: Record<string, string> = {};
    const envelope = storage.getItem(envelopeKey);
    const pendingCount = envelope ? pendingIn(envelope) : 0;
    const archives: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(`${envelopeKey}:backup:`)) archives.push(key);
    }
    // 원본 형식을 읽지 못한 경우도 사용자가 확인할 수 있게 포함한다.
    const hasPending = envelope !== null && (pendingCount === null || pendingCount > 0);
    if (!hasPending && archives.length === 0) return null;

    if (envelope !== null) entries[envelopeKey] = envelope;
    for (const key of archives.sort()) entries[key] = storage.getItem(key) ?? '';
    for (const name of Object.values(PLANNER_STORAGE_KEYS)) {
      const key = scopedKey(name, legacyCloudStorageScope(userId));
      const value = storage.getItem(key);
      if (value !== null) entries[key] = value;
    }
    const text = JSON.stringify({
      format: 1,
      kind: 'plannet-legacy-browser-drafts',
      userId,
      exportedAt: new Date().toISOString(),
      note: '예전 방식으로 이 브라우저에 남은 원문 그대로의 기록입니다. 자동으로 서버에 보내지 않았고 원본은 지우지 않았습니다.',
      entries,
    }, null, 2);
    return { keys: Object.keys(entries), pendingCount: hasPending ? pendingCount : 0, text };
  } catch {
    // 브라우저 저장소를 읽을 수 없으면 복구할 원본도 확인할 수 없다.
    return null;
  }
}

/** 사용자가 누른 경우에만 파일로 내려받는다. */
export function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
