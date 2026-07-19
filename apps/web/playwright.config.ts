import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:41783",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_APP_URL=http://localhost:41783 CRON_SECRET=e2e-follow-up-secret-0001 DEMO_MODE=true MOCK_INTEGRATIONS=true pnpm exec next dev -p 41783",
    url: "http://localhost:41783",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
