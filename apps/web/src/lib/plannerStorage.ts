import { createJSONStorage, StateStorage } from 'zustand/middleware';
import { STORAGE_KEY as MANDALART_STORAGE_KEY } from '@/lib/constants';

/**
 * 플래너 store의 persist 저장소 어댑터. 범위(scope)에 따라 저장 위치가 다르다.
 *
 * - LOCAL: 명시적으로 인증을 끈 로컬 개발 모드만. 기존 키(`plannet-*`)를 그대로 쓴다.
 * - SERVER(`server:<내부 UUID>`): 로그인한 서비스 모드. 이 어댑터는 브라우저에 전체 상태를 읽거나 쓰지 않는다.
 *   기록은 PostgreSQL에서 불러온다. PlannerSync가 저장 전 변경분만 sessionStorage에 임시 보관하고 확인 후 지운다.
 * - 인증이 켜진 환경의 미로그인·확인 중·확인 실패 상태, 서버 저장이 없는 로그인 상태에는 범위를 열지 않는다.
 * - 범위가 정해지기 전에는 읽기는 빈 값, 쓰기는 버린다.
 * - 예전 설계의 `@acct:`·`@cloud:` 키는 이 어댑터가 더 이상 쓰지 않는다. 삭제하지 않고 명시적 가져오기·복구에서 읽기만 한다.
 */

export const LOCAL_STORAGE_SCOPE = 'local';
const SCOPE_SEPARATOR = '@';
const SERVER_SCOPE_PREFIX = 'server:';

/** 브라우저 저장소를 쓰지 않는 범위인지 */
export function isMemoryScope(scope: string | null): boolean {
  return !!scope && scope.startsWith(SERVER_SCOPE_PREFIX);
}

export const PLANNER_STORAGE_KEYS = {
  mandalart: MANDALART_STORAGE_KEY,
  block6: 'plannet-block6',
  monthly: 'plannet-monthly',
  daily: 'plannet-daily',
  recurring: 'plannet-recurring',
  holidays: 'plannet-holidays',
} as const;

let activeScope: string | null = null;

export function scopedKey(name: string, scope: string): string {
  return scope === LOCAL_STORAGE_SCOPE ? name : `${name}${SCOPE_SEPARATOR}${scope}`;
}

const scopedLocalStorage: StateStorage = {
  getItem: (name) => {
    if (!activeScope || isMemoryScope(activeScope)) return null;
    try {
      return localStorage.getItem(scopedKey(name, activeScope));
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (!activeScope || isMemoryScope(activeScope)) return;
    try {
      localStorage.setItem(scopedKey(name, activeScope), value);
    } catch {
      // 저장 공간 부족·사용 불가 환경에서는 메모리 상태만 유지
    }
  },
  removeItem: (name) => {
    if (!activeScope || isMemoryScope(activeScope)) return;
    try {
      localStorage.removeItem(scopedKey(name, activeScope));
    } catch {
      // 무시
    }
  },
};

/** 모든 플래너 store가 공유하는 persist storage */
export const plannerStorage = createJSONStorage(() => scopedLocalStorage);

export function getPlannerStorageScope(): string | null {
  return activeScope;
}

export function setPlannerStorageScope(scope: string): void {
  activeScope = scope;
}

/**
 * 예전 설계의 계정별 LocalStorage 범위 이름. 이제 읽기 전용(`이전 계정 기록 가져오기`)이다.
 * - 서버가 검증한 /api/v1/me 200 응답에서 얻은 값만 넘길 것 (브라우저 입력 금지)
 * - 해시로 줄이면 충돌 시 두 계정 데이터가 섞일 수 있어 원문을 인코딩해 쓴다. 이메일은 넣지 않는다.
 * - 계정 간 섞임을 막기 위한 구분이지 보안 경계가 아니다. 내부 userId가 생기면 그 값으로 다시 키를 만든다.
 */
export function accountStorageScope(userKey: string): string {
  return `acct:${encodeURIComponent(userKey)}`;
}

/** 예전 설계의 내부 사용자별 서버 캐시 키 범위. 읽기 전용(수동 복구 파일에만 포함). */
export function legacyCloudStorageScope(userId: string): string {
  return `cloud:${userId}`;
}

/** 로그인한 서비스 모드의 범위. 브라우저 저장소를 쓰지 않는다. */
export function serverMemoryScope(userId: string): string {
  return `${SERVER_SCOPE_PREFIX}${userId}`;
}
