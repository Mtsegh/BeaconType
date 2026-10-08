import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  use: {
    trace: 'on-first-retry',
    actionTimeout: 20_000,
  },
})
