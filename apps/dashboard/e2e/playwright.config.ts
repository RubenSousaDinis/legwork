import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * The legibility gate's Playwright config. `apps/dashboard/package.json` already points
 * `e2e` at this file, and `../playwright.config.ts` re-exports it so a bare
 * `pnpm exec playwright test` from the package works too.
 *
 * Two settings are load-bearing and must not be "tidied":
 *   - the viewport is 1920x1080 with `deviceScaleFactor: 1`, because the gate reads
 *     `getComputedStyle().fontSize` in the frame that ships. Spreading
 *     `devices['Desktop Chrome']` here would reset it to 1280x720 and every floor
 *     would be measured two thirds too small.
 *   - `retries: 0`. A floor that fails is a finding to report, never something to
 *     shake loose on a second attempt.
 */

/** `webServer.cwd` defaults to the config file's directory — here, `e2e/`. */
const DASHBOARD_ROOT = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'artifacts/test-results',
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:3100',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        // `reducedMotion` was a top-level `use` option until Playwright 1.62 moved it
        // (with `contrast` and `screen`) into `contextOptions`. Same emulation, same
        // still frame: the catalog pins 1.62, so this is where the brief's setting lives.
        contextOptions: { reducedMotion: 'reduce' },
        screenshot: 'off',
        trace: 'retain-on-failure',
      },
    },
  ],
  webServer: {
    command: 'DATA_MODE=demo pnpm exec next build && DATA_MODE=demo pnpm exec next start -p 3100',
    cwd: DASHBOARD_ROOT,
    url: 'http://localhost:3100/present',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
