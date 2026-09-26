import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3650';
export default defineConfig({
  testDir: './e2e/mandalart-io', outputDir: './test-results/mandalart-io',
  timeout: 30_000, retries: 0, workers: 1, fullyParallel: false, reporter: [['list']],
  webServer: process.env.MIO_LOGIC_ONLY === '1' ? undefined : {
    command: 'node e2e/mandalart-io/start-server.mjs', url: `${baseURL}/api/runtime-config`,
    reuseExistingServer: false, timeout: 300_000, stdout: 'pipe', stderr: 'pipe',
  },
  projects: [
    { name: 'validation', testMatch: 'validation.spec.ts' },
    { name: 'desktop', testMatch: 'browser.spec.ts', use: { ...devices['Desktop Chrome'], baseURL, viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', testMatch: 'browser.spec.ts', use: { ...devices['Pixel 7'], baseURL } },
  ],
});
