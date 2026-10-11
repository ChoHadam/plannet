import { defineConfig } from '@playwright/test';

/**
 * 작업 복귀·빠른 시작(주소의 플랜 선택 복원, 빈 화면 오늘/최근, 선택적 가이드) 전용 설정.
 * 실행: npx playwright test -c playwright.work-resumption.config.ts
 *
 * 임시 소스 복사본을 빌드해 3660에서 띄운다(period-and-import와 같은 절차). 인증·DB·AI는 브라우저에서 가로챈 가상 응답이다.
 */
const PORT = '3660';
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/work-resumption',
  outputDir: 'test-results/work-resumption',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    browserName: 'chromium',
    baseURL,
    headless: true,
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/period-and-import/start-web.mjs',
    env: { ISOLATED_WEB_PORT: PORT },
    url: `${baseURL}/api/runtime-config`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
