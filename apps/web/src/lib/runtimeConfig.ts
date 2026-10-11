/** /api/runtime-config 응답. 요청 시점의 서버 설정을 클라이언트에 알린다. */
export interface RuntimeConfig {
  authEnabled: boolean;
  backupEnabled: boolean;
}

export const RUNTIME_CONFIG_PATH = '/api/runtime-config';
export const RUNTIME_CONFIG_TIMEOUT_MS = 5000;

/**
 * 플래너에 들어가기 전(확인 중·확인 실패)의 자리값. 인증·백업 UI를 모두 끈다.
 * 이 값으로 인증 꺼짐(로컬 모드)을 판단하지 않는다: 확인 실패는 항상 'unavailable'이다.
 */
export const PENDING_RUNTIME_CONFIG: RuntimeConfig = {
  authEnabled: false,
  backupEnabled: false,
};

/** 두 값이 모두 boolean일 때만 유효하다. 누락·다른 타입은 null (fail closed). */
export function parseRuntimeConfig(body: unknown): RuntimeConfig | null {
  if (!body || typeof body !== 'object') return null;
  const { authEnabled, backupEnabled } = body as Record<string, unknown>;
  if (typeof authEnabled !== 'boolean' || typeof backupEnabled !== 'boolean') return null;
  return { authEnabled, backupEnabled };
}
