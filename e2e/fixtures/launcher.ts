// Starts the built Electron launcher for a test: fresh user data (so the seeded apps install
// from scratch), no update checks against the released bundles, and diagnostics kept only when
// the test fails.
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { REPO_ROOT } from '../support/stack'

export { expect } from '@playwright/test'

const LAUNCHER_DIR = join(REPO_ROOT, 'standalone', 'launcher')

export interface Launcher {
  app: ElectronApplication
  /** The home screen (the launcher's own renderer in the main window). */
  home: Page
  /** Tap an app's home tile and return the page of the app it opens. */
  open: (tileName: string, appId: string) => Promise<Page>
}

/**
 * Switches a headless Linux CI runner needs before Chromium finishes starting: the setuid
 * sandbox needs privileges CI doesn't grant, GPU setup can hang behind Xvfb, and a small
 * `/dev/shm` fails silently. Local runs keep all of it, so they stay close to the real thing.
 */
function headlessLinuxArgs(): string[] {
  if (!process.env.CI || process.platform !== 'linux') return []
  return ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
}

/**
 * Apps run in `WebContentsView`s inside the launcher window, each a page of its own. Find the
 * one showing `appId` (served as `piapp://<appId>/…`), waiting for it to appear.
 */
async function appPage(app: ElectronApplication, appId: string): Promise<Page> {
  const prefix = `piapp://${appId}/`
  let page: Page | undefined
  await expect
    .poll(() => (page = app.windows().find((p) => p.url().startsWith(prefix))), {
      message: `no page for ${prefix}`,
    })
    .toBeTruthy()
  return page!
}

export const test = base.extend<{ launcher: Launcher }>({
  launcher: async ({}, use, testInfo) => {
    const userData = await mkdtemp(join(tmpdir(), 'pipod-e2e-'))

    // The launcher's own dependency, so the suite always drives the Electron it ships with.
    const executablePath = createRequire(join(LAUNCHER_DIR, 'package.json'))('electron') as string
    const app = await electron.launch({
      executablePath,
      args: [LAUNCHER_DIR, `--user-data-dir=${userData}`, ...headlessLinuxArgs()],
      // Unpackaged, the launcher already treats itself as dev (windowed, seed from the repo);
      // this also keeps it from pulling released bundles over the freshly built ones.
      env: { ...process.env, PIPOD_NO_UPDATE: '1' },
      timeout: 30_000,
    })

    // Collected from the start: when startup stalls, the main process log is the only account.
    const logs: string[] = []
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    await app.context().tracing.start({ screenshots: true, snapshots: true })

    try {
      const home = await app.firstWindow()
      await use({
        app,
        home,
        open: async (tileName, appId) => {
          await home.getByRole('button', { name: tileName }).click()
          return appPage(app, appId)
        },
      })
    } finally {
      const failed = testInfo.status !== testInfo.expectedStatus
      if (failed) {
        await testInfo.attach('main-process-log', { body: logs.join('') || '<no output>' })
      }
      const trace = testInfo.outputPath('trace.zip')
      await app.context().tracing.stop(failed ? { path: trace } : {})
      if (failed) await testInfo.attach('trace', { path: trace, contentType: 'application/zip' })
      await app.close().catch(() => undefined)
      await rm(userData, { recursive: true, force: true })
    }
  },
})
