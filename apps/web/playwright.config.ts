import { defineConfig } from '@playwright/test';
import { HOST, PORTS, READY_PATH } from './e2e/support/stack.config.mjs';

/**
 * 전용 포트의 E2E 스택만 사용한다 (e2e/support/start-stack.mjs).
 * 다른 작업의 서버를 재사용하지 않도록 reuseExistingServer는 끈다.
 *
 * - local:  인증 off 빌드에서 템플릿 기능 회귀 검증
 * - auth:   모의 Spring 인증 + edge proxy로 로그인·로그아웃·API 보호 검증
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // 모의 서버 상태(세션·장애 모드)를 테스트끼리 공유하므로 순차 실행한다.
  workers: 1,
  fullyParallel: false,
  use: {
    headless: true,
  },
  webServer: {
    command: 'node e2e/support/start-stack.mjs',
    url: `http://${HOST}:${PORTS.edge}${READY_PATH}`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'local',
      testMatch: 'templates.spec.ts',
      use: { browserName: 'chromium', baseURL: `http://${HOST}:${PORTS.webLocal}` },
    },
    {
      name: 'auth',
      testMatch: 'auth*.spec.ts',
      use: { browserName: 'chromium', baseURL: `http://${HOST}:${PORTS.edge}` },
    },
  ],
});
