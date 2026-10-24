# GitHub Copilot instructions — piPod

Custom instructions for GitHub Copilot when working in this repository.

## Project and commands

**piPod** is a Yarn 4.17.1 workspace for a touch-first Raspberry Pi app platform: a darts board,
a kiosk dashboard, a tournament console, a LAN-hosted tournament server, and an Electron launcher
that packages the apps onto the Pi. Use Node.js `^22.18.0 || >=24.12.0`.

```sh
yarn install
yarn dev:board        # board Vite app
yarn dev:console      # tournament-console Vite app
yarn dev:server       # Fastify + Socket.IO server
yarn dev:launcher     # Electron launcher (home screen + app store shell)
yarn type-check       # all workspaces; primary automated check
yarn build            # type-check, then build the board and console
yarn build:launcher   # build the Electron launcher (electron-vite + electron-builder)
yarn prepare-seed     # build the board and regenerate the launcher seed manifest
yarn test             # run the vitest suites once (board, console, launcher, server)
yarn test:watch       # vitest in watch mode
yarn format           # format supported source and config files
yarn format:check     # verify formatting without changes
yarn preview:board
yarn preview:console
yarn start:server
yarn workspace @pipod/server db:generate  # after changing the Drizzle schema
yarn workspace @pipod/server db:check     # validate migration metadata
```

Automated tests run under vitest (`yarn test` from the repo root — cannot be run from inside a
workspace under Yarn 4). For a focused check, run the owning workspace's type check, for
example `yarn workspace @pipod/board type-check`, `yarn workspace @pipod/console
type-check`, `yarn workspace @pipod/server type-check`, or `yarn workspace @pipod/shared
type-check`. The launcher also has an eslint `lint` script. The root `yarn type-check` runs
every workspace's `type-check` script, so a new workspace only needs to define one.

## Architecture

- `apps/board` is the fullscreen touchscreen scorer. `game/useDartGame.ts` owns local turn,
  bust, finish, and undo state; `game/checkout.ts` is its pure checkout solver. Tournament mode
  in `game/tournamentClient.ts` layers on top of that engine: the board remains authoritative for
  scoring a live leg, then streams throws and reports completed legs to the server. Offline play
  must remain independent of the tournament connection.
- `standalone/console` is the Vue Router tournament management and overview app. Its typed REST client
  calls `/api`; its Socket.IO client receives tournament snapshots and live-match updates. In
  development, its Vite proxy forwards both `/api` and `/socket.io` to `SERVER_URL` (default
  `http://localhost:3000`).
- `standalone/server` exposes the Fastify REST API and Socket.IO on one port. Routes validate request
  bodies with schemas from `@pipod/shared`, services mutate SQLite through Drizzle, and
  `realtime/` broadcasts snapshots, match changes, and the in-memory live-score mirror. It can
  serve a built console SPA when `CONSOLE_DIR` is set; SQLite lives at
  `${DATA_DIR:-./data}/pipod.db`. Drizzle applies committed migrations at startup; define
  table and index changes only in `standalone/server/src/db/schema.ts`, then generate a migration.
- `packages/shared` is the contract boundary: domain models, Zod request schemas, and typed
  Socket.IO event maps are exported from its root. Change these contracts before adapting server
  and client code, and keep all three consumers aligned.
- Tournament scheduling math is pure under `standalone/server/src/engine`; orchestration in
  `services/tournaments.ts` persists generated round-robin groups or knockout brackets. Match
  lifecycle and bracket advancement belong in `services/matches.ts`.
- `standalone/launcher` is the Electron shell that runs on the Pi: a home screen (`src/renderer`)
  showing installed-app tiles, an app store, and a full-screen settings screen, plus a main
  process (`src/main`) that installs/updates app bundles and launches each one as a
  `WebContentsView` served over the custom `piapp://` scheme. Its launcher settings are only
  reachable through the `window.launcher` preload bridge, so launcher UI stays in the renderer
  rather than shipping as a `piapp://` bundle. `yarn prepare-seed` builds the board and refreshes
  the seed manifest bundled under `resources/seed`.

## Domain rules

- A turn is up to 3 darts; going below 0 busts and reverts the whole turn.
- Single-out: finish on exactly 0 with any dart.
- Double-out: finishing dart must be a double (bull 50 counts); finishing on a non-double, or
  leaving a score of 1, busts. A dart is a double when `multiplier === 2`; triple-25 is illegal.

## Conventions & constraints

- Follow the existing style: `<script setup lang="ts">`, composition API, dark slate/cyan
  theme, and comments that explain _why_.
- Board interactions are touchscreen-first: retain comfortable 44–48px minimum tap targets and
  use the on-screen keyboard for player names.
- Keep board scoring logic framework-light and UI-agnostic in `apps/board/src/game`; components
  should stay focused on presentation and interaction.
- Cover important functionality with vitest — especially pure logic like the scoring/checkout
  engine (`apps/board/src/game`) and the server's scheduling engine (`standalone/server/src/engine`).
  Add or update tests alongside behavior changes. Vue component tests use `@vue/test-utils` +
  `happy-dom`; the frontend apps (board, console, launcher) share the DOM test config via the root
  `vitest.vue.ts` helper, and all four workspaces run under `yarn test`. In component tests, prefer
  asserting emitted events / behavior over post-interaction DOM state: under happy-dom, `await
wrapper.trigger(...)` updates component refs (so `emitted()` is reliable) but doesn't always flush
  the computed-driven re-render, so checks like `attributes('disabled')` after a click can be stale.
- The shared domain mirrors board scoring vocabulary. Use `@pipod/shared` types and schemas
  rather than duplicating request payloads or Socket.IO event signatures in an app.
- Keep REST mutations broadcasting through `realtime/hub.ts` so console overview state remains
  synchronized. The live-score mirror is display-only and resets after each reported leg.
- **Do not add dependencies** without approval. Pin **exact** versions (`1.2.3`) — no
  carets, tildes, ranges, tags, or wildcards. Never hand-edit `yarn.lock`, and do not run
  `yarn up`, `yarn up -R`, or `npx` without explicit approval.
