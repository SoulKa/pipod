import { defineConfig, devices } from '@playwright/test'
import { assertBuilt } from './support/built'
import { BOARD_PORT, BOARD_URL, REPO_ROOT, SERVER_PORT, SERVER_URL } from './support/stack'

/**
 * End-to-end suite over the real, built stack: the tournament server (serving the built
 * console), the built board in a browser, and the built Electron launcher. Run it through
 * `yarn e2e`, which rebuilds all of that first (about 8 s), so it never tests stale bundles.
 */
assertBuilt()

export default defineConfig({
  outputDir: './test-results',

  // One server and database serve the whole run, and the launcher takes over window focus:
  // tests run one at a time.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: 0,

  // Launching Electron and installing the seeded apps is far slower than a page load.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Without a limit, a click that can never happen waits out the whole test timeout and looks
  // like a hang; this fails it with Playwright's account of what it was waiting for.
  use: { actionTimeout: 10_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: './playwright-report', open: 'never' }], ['list']]
    : [['list']],

  webServer: [
    {
      command: 'yarn start:server',
      cwd: REPO_ROOT,
      url: `${SERVER_URL}/api/health`,
      // A throwaway database per run, and no browser tab popping up on the developer's desktop.
      // Debug logging shows each discovery request that arrives, so a failing discovery spec
      // tells "never reached the server" apart from "answer got lost".
      env: {
        PORT: String(SERVER_PORT),
        DB_FILE: ':memory:',
        OPEN_BROWSER: '0',
        LOG_LEVEL: 'debug',
      },
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: `yarn workspace @pipod/board preview --host 127.0.0.1 --port ${BOARD_PORT} --strictPort`,
      cwd: REPO_ROOT,
      url: BOARD_URL,
      reuseExistingServer: false,
    },
  ],

  projects: [
    {
      // Console, viewer and board in a plain browser, against the real server.
      name: 'web',
      testDir: './specs/web',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SERVER_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
      },
    },
    {
      // The Electron launcher hosting the apps. Its fixture records its own trace, because
      // `use.trace` only applies to browsers the runner starts (see fixtures/launcher.ts).
      name: 'launcher',
      testDir: './specs/launcher',
    },
  ],
})
