// The suite runs the built stack, never sources. `yarn e2e` builds it first; this catches running
// Playwright directly without that build.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './stack'

/** Everything the run starts or serves: console, board, launcher and the apps it installs. */
const ARTIFACTS = [
  'standalone/console/dist/index.html',
  'apps/board/dist/index.html',
  'standalone/launcher/out/main/index.js',
  'standalone/launcher/resources/seed/manifest.json',
]

/**
 * Throw with the fix when a build artifact is missing. Called while the config loads, because
 * Playwright starts the web servers before `globalSetup` — a missing board build would otherwise
 * surface as `vite preview` failing, and a missing console as `/admin` quietly not existing.
 */
export function assertBuilt(): void {
  const missing = ARTIFACTS.filter((file) => !existsSync(join(REPO_ROOT, file)))
  if (missing.length) {
    throw new Error(
      `Not built: ${missing.join(', ')}. Run the suite through \`yarn e2e\`, which builds first.`,
    )
  }
}
