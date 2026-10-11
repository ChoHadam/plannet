import { defineConfig } from '@playwright/test';

/**
 * UI 기본 조작(태블릿 폭·모달 키보드·사이드바 초점·한글 조합 Enter) 전용 설정.
 * 실행: npx playwright test -c playwright.ux-foundation.config.ts
 *
 * 임시 소스 복사본을 빌드해 3650에서 띄운다(period-and-import와 같은 절차). 인증·DB·AI는 브라우저에서 가로챈 가상 응답이다.
 */
const PORT = '3650';
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/ux-foundation',
  outputDir: 'test-results/ux-foundation',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    browserName: 'chromium',
    baseURL,
    headless: true,
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
