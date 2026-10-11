/**
 * E2E 전용 스택 설정. 다른 앱 서버를 재사용하지 않도록 고정된 전용 포트를 쓴다.
 * playwright.config.ts와 start-stack.mjs가 함께 읽는다.
 */

export const HOST = '127.0.0.1';

export const PORTS = {
  /** 인증 off, 서버 백업 명시적 on (개인 로컬 사용 형태) */
  webLocal: 3310,
  /** 인증 on + 모의 Spring. 서버 백업을 명시적으로 켜도 인증 때문에 막혀야 한다 */
  webPublic: 3311,
  /** 모의 Spring 인증 서버 + 모의 AI (외부 호출 없음) */
  mockApi: 3312,
  /** Ingress 역할. /api/v1/**, /oauth2/**, /login/oauth2/** → mockApi, 나머지 → webPublic */
  edge: 3313,
  /** 환경변수를 하나도 주지 않은 프로덕션 빌드 (기본값 검증) */
  webBare: 3314,
  /** 인증 on인데 API_INTERNAL_URL 누락 (설정 누락 시 fail-closed 검증) */
  webMisconfigured: 3315,
};

export const MOCK_AI_PATH = '/mock-ai/v1';
/** docs/contracts/auth-v1.md §3 */
export const SESSION_COOKIE = 'PLANNET_SESSION';

/** E2E 빌드 산출물 위치. 개발자의 .next를 건드리지 않는다. */
export const E2E_DIST_DIR = '.next/e2e';

export const READY_PATH = '/__stack/ready';
