// Builds the launcher store's release artifacts: one .tar.gz per app under apps/* plus a
// manifest.json describing them. Run AFTER each app has been built (dist/ present). The
// launcher fetches manifest.json from a GitHub Release, diffs versions/hashes against what's
// installed on the Pi, and downloads the tarballs it needs. Uses Node built-ins + system tar
// only — no dependencies.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appsDir = join(repoRoot, 'apps')
// Default output is the release staging dir; OUT_DIR retargets it (e.g. the launcher's offline
// seed) using the exact same tarball + manifest format.
const outDir = process.env.OUT_DIR ? resolve(process.env.OUT_DIR) : join(repoRoot, 'release')

const release = process.env.RELEASE_TAG ?? 'dev'
let commit = process.env.COMMIT_SHA ?? ''
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })
      .toString()
      .trim()
  } catch {
    commit = ''
  }
}

// Fresh staging dir so stale artifacts never leak into a release.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const apps = []
for (const entry of readdirSync(appsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue
  const appDir = join(appsDir, entry.name)
  const pkgPath = join(appDir, 'package.json')
  if (!existsSync(pkgPath)) continue

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const distDir = join(appDir, 'dist')
  if (!existsSync(distDir)) {
    throw new Error(`No build output at ${distDir} — build ${pkg.name} before generating the manifest.`)
  }
  const version = pkg.version

  // Each <id>.app.json is one launcher entry. Several may share a dir (and thus the same dist),
  // e.g. board + board-tournament — the id comes from the filename, not the package name.
  const descriptors = readdirSync(appDir)
    // `tsconfig.app.json` shares the suffix but isn't an app descriptor — exclude TS configs.
    .filter((f) => f.endsWith('.app.json') && !f.startsWith('tsconfig'))
    .sort((a, b) => a.localeCompare(b))
  if (descriptors.length === 0) continue

  for (const file of descriptors) {
    const id = file.slice(0, -'.app.json'.length)
    const meta = JSON.parse(readFileSync(join(appDir, file), 'utf8'))
    const artifact = `${id}-${version}.tar.gz`
    const artifactPath = join(outDir, artifact)

    // Tar the dist contents (not the dist dir itself) so extraction lands files at the app root.
    execFileSync('tar', ['-czf', artifactPath, '-C', distDir, '.'])
    const buf = readFileSync(artifactPath)

    apps.push({
      id,
      name: meta.displayName ?? pkg.description ?? id,
      description: meta.description ?? pkg.description ?? '',
      version,
      artifact,
      sha256: createHash('sha256').update(buf).digest('hex'),
      size: buf.length,
      ...(meta.icon ? { icon: meta.icon } : {}),
      ...(meta.query ? { query: meta.query } : {}),
    })
  }
}

if (apps.length === 0) {
  throw new Error(`No store apps found under ${appsDir}`)
}

const manifest = { schemaVersion: 1, release, commit, apps }
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Wrote ${apps.length} app(s) + manifest.json to ${outDir}:`)
for (const a of apps) {
  console.log(`  ${a.id}@${a.version}  sha256:${a.sha256.slice(0, 12)}…  ${a.size} bytes`)
}
