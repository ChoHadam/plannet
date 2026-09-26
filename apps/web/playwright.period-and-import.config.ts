import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/period-and-import',
  outputDir: 'test-results/period-and-import',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3640',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/period-and-import/start-web.mjs',
    url: 'http://127.0.0.1:3640/api/runtime-config',
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
