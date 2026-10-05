import { defineConfig } from '@playwright/test';

/**
 * E2E smoke config. Assumes the API (:5000) and client (:3000) are already
 * running -- start them with `start.bat` first. A separate `webServer` block
 * just refuses to guess; if you want one command, run `npx playwright test`
 * after `start.bat`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    // Use the Chrome already on this machine -- no 170 MB browser download.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
});
