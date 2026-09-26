import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { BROWSER_HOST_RULES, PUBLIC_ORIGIN } from './support/env';

/**
 * 배포 검증 E2E. scripts/verify-local.sh 가 kind 클러스터에 배포한 뒤 실행한다.
 * 서버를 직접 띄우지 않는다 (webServer 없음). 결과는 VERIFY_ARTIFACTS_DIR 에만 쓴다.
 */
const artifactsDir = process.env.VERIFY_ARTIFACTS_DIR ?? path.resolve('artifacts');

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: path.join(artifactsDir, 'test-results'),
  timeout: 60_000,
  retries: 0,
  // 클러스터 상태(API 장애 주입, 호출 한도, 대역 통계)를 공유하므로 순차 실행한다.
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifactsDir, 'results.json') }],
    ['html', { outputFolder: path.join(artifactsDir, 'report'), open: 'never' }],
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: PUBLIC_ORIGIN,
    // 검증용 자체 서명 인증서. 실제 공개 HTTPS 검증은 scripts/check-public.sh 로 따로 한다.
    ignoreHTTPSErrors: true,
    launchOptions: { args: [`--host-resolver-rules=${BROWSER_HOST_RULES}`] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
