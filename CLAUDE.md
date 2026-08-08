# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**piPod** is a Yarn 4.17.1 workspace (Node `^22.18.0 || >=24.12.0`) for a touch-first app
platform that runs on a Raspberry Pi: an Electron launcher hosts a home screen of installable
apps. The darts scorer is one such app; the transit/weather dashboard is another.

- **`apps/board`** — the full-screen touchscreen darts scorer (Vue 3, `<script setup>`, Vite).
  Scored entirely by tapping; player names go through an on-screen keyboard. Plays offline
  standalone, or joins a tournament.
- **`apps/dashboard`** — a kiosk dashboard app (Vue 3, Vite, UnoCSS): weather (Open-Meteo) plus
  Stuttgart VVS transit departures. Pure static SPA, no backend.
- **`standalone/console`** — Vue Router tournament management/overview app (Vite).
- **`standalone/server`** — Fastify + Socket.IO tournament server on a single port; SQLite via
  Drizzle.
- **`standalone/launcher`** — Electron shell that runs on the Pi: a home screen of installed-app
  tiles, an app store, and a settings screen; installs/updates app bundles and launches each as a
  `WebContentsView`.
- **`packages/shared`** (`@pipod/shared`) — the contract boundary: domain models, Zod request
  schemas, and typed Socket.IO event maps consumed by all of the above.

## Commands

Run everything from the repo root. Yarn 4 does **not** allow running scripts from inside a
workspace directory — always use `yarn workspace <name> <script>` for workspace-scoped commands.

```sh
yarn install
yarn dev:board        # board Vite app (hot reload)
yarn dev:console      # tournament-console Vite app
yarn dev:server       # Fastify + Socket.IO server
yarn dev:launcher     # Electron launcher
yarn type-check       # all workspaces; primary automated gate
yarn build            # type-check, then build board + console
yarn build:launcher   # build the Electron launcher (electron-vite + electron-builder)
yarn prepare-seed     # build the board and regenerate the launcher's seed manifest
yarn test             # run the vitest suites once (board, console, launcher, server)
yarn test:watch       # vitest in watch mode
yarn format           # prettier --write
yarn format:check     # prettier --check
yarn preview:board / yarn preview:console
yarn start:server     # run the server without the watcher
yarn workspace @pipod/server db:generate  # after changing the Drizzle schema
yarn workspace @pipod/server db:check     # validate migration metadata
```

Testing / verification:

- `yarn test` runs vitest from the root (it **cannot** be run from within a workspace under Yarn
  4). Run a single file with `yarn test <path/to/file.test.ts>`, or a single case with
  `yarn test -t "<test name>"`.
- For a focused type check use the owning workspace, e.g. `yarn workspace @pipod/server
type-check`. The **launcher's** script is `typecheck` (no hyphen) and it also has an eslint
  `lint` script; the other workspaces have no lint script.
- Every workspace has a vitest suite (board covers the game engine + a component test). For
  UI/behavior not covered by tests, verify by running the relevant `yarn dev:*` and exercising the
  flow in a browser.
- `standalone/server/src/test/e2e/` boots the real stack (`startServer` on port 0) and drives a
  whole tournament over real socket.io connections and `/api` calls — the only coverage of the
  board↔server wire contract, since every other suite mocks one side of it. Add cases there when
  changing `realtime/`, the socket event maps, or match/floor lifecycle.
- **Run one command per Bash call.** Chaining with `&&` / `;`, piping into `tail`/`head`, and
  reading exit codes with `echo $?` (or `echo $EXIT`) all trigger manual approval prompts. A
  single command per call runs without approval — e.g. run `yarn test --project board` and
  `yarn type-check` as separate calls instead of joining them.

## Architecture

**`packages/shared` is the source of truth.** Domain models, Zod request schemas, and Socket.IO
event maps are exported from its root. Change these contracts _first_, then adapt the server and
clients together — the server, console, and tournament-mode board all depend on them staying
aligned.

**Board (`apps/board`).** Game logic is deliberately kept out of components, in framework-light
modules under `apps/board/src/game/`:

- **`useDartGame.ts`** — core composable: `phase` (`'setup' | 'playing'`), `players`, per-game
  `options` (`startScore`, `outMode`), the current turn's throws, finish order, and undo history.
  Exposes `throwDart`, `undo`, `startGame`, `backToSetup`, `continuePlaying`, and `checkoutRoutes`.
  Constants: `THROWS_PER_TURN = 3`, `START_SCORES = [301, 501]`, `DEFAULT_OPTIONS`.
- **`checkout.ts`** — pure checkout solver: `suggestCheckouts(score, dartsLeft, outMode)` returns
  up to 3 routes; `dartLabel()` formats a dart (`T20`, `D16`, `Bull`). No Vue dependency.
- **`setupStorage.ts`** — `loadSetup()`/`saveSetup()` persist the roster + options to
  `localStorage`; defensive parsing, never throws.
- **`tournamentClient.ts`** — layers tournament mode on top of the local engine. The board stays
  authoritative for scoring a live leg, streams throws, and reports completed legs to the server.
  **Offline play must remain independent of the tournament connection.**

**Server (`standalone/server`).** Fastify REST API and Socket.IO share one port. Routes validate
bodies with `@pipod/shared` schemas; services mutate SQLite through Drizzle; `realtime/`
broadcasts snapshots, match changes, and the in-memory live-score mirror (display-only; resets
after each reported leg). Keep REST mutations broadcasting through `realtime/hub.ts` so console
overview state stays synchronized. Tournament scheduling math is pure under `src/engine`;
orchestration in `services/tournaments.ts` persists round-robin groups / knockout brackets, and
match lifecycle + bracket advancement live in `services/matches.ts`. SQLite lives at
`${DATA_DIR:-./data}/pipod.db`; Drizzle applies committed migrations at startup — define table
and index changes only in `src/db/schema.ts`, then generate a migration. The server can serve a
built console SPA when `CONSOLE_DIR` is set. Logging goes through `src/logger.ts` (plain text
instead of pino's JSON, one line per request, `LOG_LEVEL` to change verbosity) — log through
`app.log` / `request.log` or the exported `log`, not `console.log`. `subscribeToLogs()` mirrors
records at `debug` and above regardless of `LOG_LEVEL`; `realtime/` forwards them to consoles in
the `logs` room, and a subscriber must never log (it would recurse).

**Console (`standalone/console`).** Its typed REST client calls `/api`; its Socket.IO client
receives tournament snapshots and live-match updates. The shell (`App.vue`) also opens a
session-long log feed (`serverLogs.ts` → `logs:subscribe`) and renders `LogTerminal.vue` as a
bottom drawer (topbar button or Ctrl+backtick); the server forwards live lines only, so the
buffer lives in the tab and filtering by level/text happens client-side. In dev, Vite proxies
`/api` and `/socket.io` to `SERVER_URL` (default `http://localhost:3000`).

**Launcher (`standalone/launcher`).** `src/renderer` is the Vue home screen (app tiles, store,
full-screen settings); `src/main` is the Electron main process that installs/updates app bundles
and launches each as a `WebContentsView` served over the custom `piapp://` scheme. Launcher
settings are only reachable via the `window.launcher` preload bridge, so launcher UI stays in the
renderer rather than shipping as a `piapp://` bundle. `yarn prepare-seed` refreshes the seed
manifest bundled under `resources/seed`.

## Domain rules

- A turn is up to 3 darts. Going below 0 is a **bust** (whole turn reverts).
- **Single-out:** finish on exactly 0 with any dart.
- **Double-out:** the finishing dart must be a double (incl. bull 50 = double-25); reaching 0 on a
  non-double busts, and leaving a score of 1 busts.
- A dart is a "double" when `multiplier === 2`. Triple-25 is illegal.
- The shared domain mirrors this board scoring vocabulary — reuse `@pipod/shared` types/schemas
  rather than duplicating payloads or event signatures in an app.

## Conventions

- Match the surrounding style: `<script setup lang="ts">`, composition API, small focused
  components, dark slate/cyan theme. Comments explain **why**, not what; keep the existing density.
- Board interactions are touchscreen-first: keep comfortable ~44–48px minimum tap targets and use
  the on-screen keyboard for names. Don't shrink tap targets.
- Keep board scoring logic pure and UI-agnostic in `apps/board/src/game`; components stay focused
  on presentation and interaction.
- Cover important functionality with vitest — especially pure logic like the scoring/checkout
  engine (`apps/board/src/game`) and the server's scheduling engine (`standalone/server/src/engine`).
  Add or update tests alongside behavior changes. Vue component tests use `@vue/test-utils` +
  `happy-dom`; the frontend apps (board, console, launcher) share the DOM test config via the root
  `vitest.vue.ts` helper, and all four workspaces run under `yarn test`. In component tests, prefer
  asserting emitted events / behavior over post-interaction DOM state: under happy-dom, `await
wrapper.trigger(...)` updates component refs (so `emitted()` is reliable) but doesn't always flush
  the computed-driven re-render, so checks like `attributes('disabled')` after a click can be stale.

## Constraints (dependencies & tooling)

- **Do not add dependencies** without explicit approval; nothing outside `package.json`.
- Pin **exact** versions (`1.2.3`) — no ranges/carets/tildes/tags/wildcards.
- Never hand-edit `yarn.lock`; never run `yarn up`/`yarn up -R` or `npx` without explicit
  confirmation.
