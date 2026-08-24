import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, in a real browser, against a real build.
 *
 * 612 unit and integration tests say each piece works. None of them opens a
 * browser, and the failures a restaurant actually phones about live in the
 * gaps between pieces: the sign-in that sets the wrong cookie, the dock that
 * sits under the home indicator, the download button whose MIME type makes
 * Chrome save a file it cannot open. These run the built app the way a person
 * does.
 *
 * Against `next start`, not `next dev`: dev mode compiles on demand and hides
 * the one class of bug — a route missing from the production build — that this
 * suite exists to catch. `pnpm build` first; the web server block below reuses
 * a server that is already up so a local loop stays fast.
 *
 * Two projects: a desktop viewport for the console and the marketing site, and
 * a phone for the five surfaces that are only ever opened on one. A test that
 * passes at 1280px and fails at 390px is the common case, not the edge.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The box has eight cores and the site, the API and Postgres to run beside
  // this. Two browsers is what it affords without evicting something.
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'uz-UZ',
  },
  projects: [
    // Phone specs run on the phone only: a dock that is fine at 1280px is
    // exactly the thing the phone project exists to catch, and running the
    // measurement at desktop width would pass for the wrong reason.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /\.phone\.spec\.ts$/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /\.phone\.spec\.ts$/ },
  ],
  webServer: {
    command: 'npx next start --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
