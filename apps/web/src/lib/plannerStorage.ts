import { createJSONStorage, StateStorage } from 'zustand/middleware';
import { STORAGE_KEY as MANDALART_STORAGE_KEY } from '@/lib/constants';

/**
 * 계정별로 분리된 플래너 LocalStorage.
 *
 * - 로그인하지 않은 상태(또는 인증 꺼짐)는 LOCAL 범위를 쓴다. 기존 키(`plannet-*`)를 그대로 쓰므로
 *   로그인 도입 전 데이터가 이 범위에 보존된다.
 * - 로그인한 계정은 `plannet-*@acct:<provider>%3A<subject>` 키를 쓴다. 기존 공통 데이터를 계정에 자동 귀속하지 않는다.
 * - 범위가 정해지기 전에는 읽기는 빈 값, 쓰기는 버린다. 잘못된 범위에 저장되는 것을 막는다.
 */

export const LOCAL_STORAGE_SCOPE = 'local';
const SCOPE_SEPARATOR = '@';

export const PLANNER_STORAGE_KEYS = {
  mandalart: MANDALART_STORAGE_KEY,
  block6: 'plannet-block6',
  monthly: 'plannet-monthly',
  daily: 'plannet-daily',
  recurring: 'plannet-recurring',
  holidays: 'plannet-holidays',
} as const;

let activeScope: string | null = null;

function scopedKey(name: string, scope: string): string {
  return scope === LOCAL_STORAGE_SCOPE ? name : `${name}${SCOPE_SEPARATOR}${scope}`;
}

const scopedLocalStorage: StateStorage = {
  getItem: (name) => {
    if (!activeScope) return null;
    try {
      return localStorage.getItem(scopedKey(name, activeScope));
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (!activeScope) return;
    try {
      localStorage.setItem(scopedKey(name, activeScope), value);
    } catch {
      // 저장 공간 부족·사용 불가 환경에서는 메모리 상태만 유지
    }
  },
  removeItem: (name) => {
    if (!activeScope) return;
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
 * 계정 식별 키(`${authProvider}:${externalSubject}`)로 LocalStorage 범위 이름을 만든다.
 * - 서버가 검증한 /api/v1/me 200 응답에서 얻은 값만 넘길 것 (브라우저 입력 금지)
 * - 해시로 줄이면 충돌 시 두 계정 데이터가 섞일 수 있어 원문을 인코딩해 쓴다. 이메일은 넣지 않는다.
 * - 계정 간 섞임을 막기 위한 구분이지 보안 경계가 아니다. 내부 userId가 생기면 그 값으로 다시 키를 만든다.
 */
export function accountStorageScope(userKey: string): string {
  return `acct:${encodeURIComponent(userKey)}`;
}

/** 로그인 전(LOCAL 범위)에 저장된 플랜이 이 브라우저에 남아 있는지 */
export function hasLocalScopeData(): boolean {
  try {
    return Object.values(PLANNER_STORAGE_KEYS).some((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const state = (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {};
      return Object.values(state).some((value) =>
        Array.isArray(value) ? value.length > 0 : typeof value === 'object' && value !== null && Object.keys(value).length > 0,
      );
    });
  } catch {
    return false;
  }
}
