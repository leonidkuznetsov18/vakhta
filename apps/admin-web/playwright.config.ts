import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/browser',
  use: { baseURL: 'http://127.0.0.1:5183', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5183',
    url: 'http://127.0.0.1:5183/e2e/profile.html',
    reuseExistingServer: false,
  },
});
