import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './smoke',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    browserName: 'chromium',
    headless: true
  }
});
