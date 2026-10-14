import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E tests run against the production build (`npm run build` first) with MOCK_MODE=1,
 * so no AI quota is used. Needs DATABASE_URL pointing at a migrated Postgres.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.PW_CHROMIUM_PATH ? "off" : "retain-on-failure", // video needs Playwright's ffmpeg
    // Optional: reuse an already-installed Chromium instead of `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /landing\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/ping`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/autoscript",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "e2e-secret-e2e-secret-e2e-secret-1234",
      BETTER_AUTH_URL: BASE_URL,
      MOCK_MODE: "1",
      DEMO_LOGINS: "1",
      DEMO_PASSWORD: "Recruiter@2026",
      OWNER_EMAIL: "owner@e2e.test",
      OWNER_PASSWORD: "Owner-E2E-password-1",
      OWNER_NAME: "E2E Owner",
      // No proxy locally: the visitor IP is the last X-Forwarded-For entry, which each test sets.
      TRUSTED_PROXY_HOPS: "0",
    },
  },
});
