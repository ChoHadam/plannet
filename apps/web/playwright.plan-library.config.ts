import { defineConfig } from '@playwright/test';
import { HOST, PORTS, READY_PATH, RESULTS_DIR } from './e2e/plan-library/stack.config.mjs';

/**
 * 전체 플랜 목록(plan-library) 전용 설정. 공용 playwright.config.ts의 testMatch와 포트를 쓰지 않는다.
 *
 * - local:     인증 off. 전체 목록·검색·선택·키보드·모바일, 기존 템플릿 회귀(templates.spec.ts)
 * - auth:      모의 Spring 인증. 계정 전환 시 목록 격리
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: RESULTS_DIR,
  timeout: 60_000,
  retries: 0,
  // 모의 인증 서버 상태를 공유하므로 순차 실행한다.
  workers: 1,
  fullyParallel: false,
  use: {
    headless: true,
  },
  webServer: {
    command: 'node e2e/plan-library/start-stack.mjs',
    url: `http://${HOST}:${PORTS.edge}${READY_PATH}`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'local',
      testMatch: ['plan-library/library.spec.ts', 'templates.spec.ts'],
      use: { browserName: 'chromium', baseURL: `http://${HOST}:${PORTS.webLocal}` },
    },
    {
      name: 'auth',
      testMatch: 'plan-library/account.spec.ts',
      use: { browserName: 'chromium', baseURL: `http://${HOST}:${PORTS.edge}` },
    },
  ],
});
