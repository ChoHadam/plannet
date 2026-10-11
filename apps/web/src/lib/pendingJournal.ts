import { parsePendingState, PendingJournal, PendingState } from '@/lib/plannerSync';

/**
 * 저장 전 변경분의 임시 보관(sessionStorage). 새로고침에는 남고 탭을 닫으면 사라진다.
 * - 검증된 내부 사용자 UUID별 키 하나만 쓴다. 다른 계정·로그인 전 화면에서는 읽지 않는다.
 * - 바뀐 기록과 전송 중 요청만 담는다. 서버 기록 전체·기준 사본은 담지 않는다.
 * - 저장이 모두 확인되면 이 키만 지운다. 저장소 전체를 지우지 않는다.
 * - 저장소 접근·용량 오류는 false/unavailable로만 알린다(DB 자동 저장을 막지 않는다).
 */
export const PENDING_JOURNAL_FORMAT = 1;
export const pendingJournalKey = (userId: string) => `plannet-pending@${userId}`;

type SessionLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function sessionPendingJournal(userId: string, storage: () => SessionLike = () => sessionStorage): PendingJournal {
  const key = pendingJournalKey(userId);
  return {
    read() {
      let raw: string | null;
      try { raw = storage().getItem(key); }
      catch { return { status: 'unavailable' }; }
      if (raw === null) return { status: 'empty' };
      let state: PendingState | null = null;
      try { state = parsePendingState(JSON.parse(raw), userId); } catch { state = null; }
      return state ? { status: 'ok', state, raw } : { status: 'invalid', raw };
    },
    write(state) {
      try {
        storage().setItem(key, JSON.stringify({ format: PENDING_JOURNAL_FORMAT, userId, savedAt: new Date().toISOString(), ...state }));
        return true;
      } catch { return false; }
    },
    clear() {
      try { storage().removeItem(key); return true; }
      catch { return false; }
    },
  };
}
