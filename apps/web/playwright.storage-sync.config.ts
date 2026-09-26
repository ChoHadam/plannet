import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3680';
export default defineConfig({
  testDir: './e2e/storage-sync', outputDir: './test-results/storage-sync',
  timeout: 30_000, retries: 0, workers: 1, fullyParallel: false, reporter: [['list']],
  webServer: process.env.STORAGE_SYNC_LOGIC_ONLY === '1' ? undefined : {
    command: 'node e2e/storage-sync/start-server.mjs', url: `${baseURL}/api/runtime-config`,
    reuseExistingServer: false, timeout: 300_000, stdout: 'pipe', stderr: 'pipe',
  },
  projects: [
    { name: 'logic', testMatch: 'logic.spec.ts' },
    { name: 'browser', testMatch: 'browser.spec.ts', use: { ...devices['Desktop Chrome'], baseURL, viewport: { width: 1440, height: 1100 } } },
  ],
});
