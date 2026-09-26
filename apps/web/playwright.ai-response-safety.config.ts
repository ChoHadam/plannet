import { defineConfig, devices } from '@playwright/test';
import { AIRS_HOST, AIRS_PORT } from './e2e/ai-response-safety/server.config.mjs';

/**
 * 지연 AI 응답 보호 검증 전용 설정. 기본 playwright.config.ts의 testMatch와 분리한다.
 * 실행: npx playwright test -c playwright.ai-response-safety.config.ts
 *
 * - logic:   순수 함수(lib/aiResponseSafety.ts) 검사. 브라우저 없음
 * - desktop / mobile: 전용 서버(3520)에서 /api/chat 응답을 테스트가 붙잡고 원하는 시점에 돌려준다
 */
const baseURL = `http://${AIRS_HOST}:${AIRS_PORT}`;

export default defineConfig({
  testDir: './e2e/ai-response-safety',
  outputDir: process.env.AIRS_OUTPUT_DIR || './test-results/ai-response-safety',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  webServer: {
    command: 'node e2e/ai-response-safety/start-server.mjs',
    url: `${baseURL}/api/runtime-config`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'logic', testMatch: 'logic.spec.ts' },
    {
      name: 'desktop',
      testMatch: 'chat.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL, viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: 'chat.spec.ts',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'], baseURL },
    },
  ],
});
