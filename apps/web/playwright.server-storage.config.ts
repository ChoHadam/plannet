import { defineConfig } from '@playwright/test';
import { HOST, ORIGIN, PORTS, READY_PATH } from './e2e/server-storage/config.mjs';

export default defineConfig({
  testDir: './e2e/server-storage',
  testMatch: '*.spec.ts',
  outputDir: 'test-results/server-storage',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: { browserName: 'chromium', baseURL: ORIGIN, headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node e2e/server-storage/start-stack.mjs',
    url: `http://${HOST}:${PORTS.control}${READY_PATH}`,
    reuseExistingServer: false,
    timeout: 300_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    stdout: 'pipe', stderr: 'pipe',
  },
});
