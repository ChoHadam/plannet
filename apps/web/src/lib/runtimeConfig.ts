/** /api/runtime-config 응답. 요청 시점의 서버 설정을 클라이언트에 알린다. */
export interface RuntimeConfig {
  authEnabled: boolean;
  backupEnabled: boolean;
}

export const RUNTIME_CONFIG_PATH = '/api/runtime-config';

/** 설정을 받지 못했을 때의 보수적 기본값: 인증·백업 UI를 모두 끈다. */
export const FALLBACK_RUNTIME_CONFIG: RuntimeConfig = {
  authEnabled: false,
  backupEnabled: false,
};
