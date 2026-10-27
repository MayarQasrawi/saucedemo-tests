import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // fail the CI run if a test.only was committed by mistake
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // on CI, the github reporter adds failure annotations to the PR
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://www.saucedemo.com',
    // saucedemo uses data-test="..." so getByTestId() will look for it
    testIdAttribute: 'data-test',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
