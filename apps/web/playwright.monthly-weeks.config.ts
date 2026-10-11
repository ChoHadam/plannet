import { defineConfig } from '@playwright/test';

/**
 * 6주인 달의 주차 정합성(공통 월~일 주차, Monthly W6, 이전 W1~W5 호환) 전용 설정.
 * 실행: npx playwright test -c playwright.monthly-weeks.config.ts
 * 순수 함수만: MONTHLY_WEEKS_LOGIC_ONLY=1 … --project logic
 *
 * 브라우저 검사는 임시 소스 복사본을 빌드해 3670에서 띄운다(period-and-import와 같은 절차). 인증·DB는 브라우저에서 가로챈 가상 응답이다.
 */
const PORT = '3670';
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/monthly-weeks',
  outputDir: 'test-results/monthly-weeks',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  projects: [
    { name: 'logic', testMatch: 'logic.spec.ts' },
    {
      name: 'browser', testMatch: 'browser.spec.ts',
      use: { browserName: 'chromium', baseURL, headless: true, timezoneId: 'Asia/Seoul', trace: 'retain-on-failure' },
    },
  ],
  webServer: process.env.MONTHLY_WEEKS_LOGIC_ONLY === '1' ? undefined : {
    command: 'node e2e/period-and-import/start-web.mjs',
    env: { ISOLATED_WEB_PORT: PORT },
    url: `${baseURL}/api/runtime-config`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
