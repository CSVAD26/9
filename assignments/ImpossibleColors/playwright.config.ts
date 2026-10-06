import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'headless', use: { headless: true } },
    { name: 'headed', use: { headless: false, launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=metal'] } } },
  ],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5180', reuseExistingServer: true, timeout: 30000 },
});
