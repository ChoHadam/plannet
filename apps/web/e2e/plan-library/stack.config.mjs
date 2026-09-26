/**
 * plan-library 전용 E2E 스택 설정.
 * 공용 스택(e2e/support, 3310~3315, .next/e2e)과 겹치지 않도록 포트·빌드·결과 경로를 따로 쓴다.
 */

export const HOST = '127.0.0.1';

export const PORTS = {
  /** 인증 off (LOCAL 저장 범위) */
  webLocal: 3530,
  /** 인증 on + 모의 Spring */
  webPublic: 3531,
  /** 모의 Spring 인증 서버 + 모의 AI (외부 호출 없음) */
  mockApi: 3532,
  /** /api/v1/**, /oauth2/**, /login/oauth2/** → mockApi, 나머지 → webPublic */
  edge: 3533,
};

export const MOCK_AI_PATH = '/mock-ai/v1';

/** 개발자의 .next와 공용 E2E 빌드(.next/e2e)를 건드리지 않는다. */
export const DIST_DIR = '.next/plan-library-e2e';
export const TSCONFIG_PATH = 'e2e/plan-library/tsconfig.json';
export const RESULTS_DIR = 'test-results/plan-library';

export const READY_PATH = '/__stack/ready';
