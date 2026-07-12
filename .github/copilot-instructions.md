# GitHub Copilot instructions — pi-darts

Custom instructions for GitHub Copilot when working in this repository.

## Project and commands

**pi-darts** is a Yarn 4.17.1 workspace for a touch-first Raspberry Pi darts board, a
tournament console, and a LAN-hosted tournament server. Use Node.js `^22.18.0 || >=24.12.0`.

```sh
yarn install
yarn dev:board        # board Vite app
yarn dev:console      # tournament-console Vite app
yarn dev:server       # Fastify + Socket.IO server
yarn type-check       # all workspaces; primary automated check
yarn build            # type-check, then build the board and console
yarn format           # format supported source and config files
yarn format:check     # verify formatting without changes
yarn preview:board
yarn preview:console
yarn start:server
yarn workspace @pi-darts/server db:generate  # after changing the Drizzle schema
yarn workspace @pi-darts/server db:check     # validate migration metadata
```

There is no test runner or lint script. For a focused automated check, run the owning
workspace's type check, for example `yarn workspace @pi-darts/board type-check`,
`yarn workspace @pi-darts/console type-check`, `yarn workspace @pi-darts/server type-check`,
or `yarn workspace @pi-darts/shared type-check`.

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
  bodies with schemas from `@pi-darts/shared`, services mutate SQLite through Drizzle, and
  `realtime/` broadcasts snapshots, match changes, and the in-memory live-score mirror. It can
  serve a built console SPA when `CONSOLE_DIR` is set; SQLite lives at
  `${DATA_DIR:-./data}/pi-darts.db`. Drizzle applies committed migrations at startup; define
  table and index changes only in `standalone/server/src/db/schema.ts`, then generate a migration.
- `packages/shared` is the contract boundary: domain models, Zod request schemas, and typed
  Socket.IO event maps are exported from its root. Change these contracts before adapting server
  and client code, and keep all three consumers aligned.
- Tournament scheduling math is pure under `standalone/server/src/engine`; orchestration in
  `services/tournaments.ts` persists generated round-robin groups or knockout brackets. Match
  lifecycle and bracket advancement belong in `services/matches.ts`.

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
- The shared domain mirrors board scoring vocabulary. Use `@pi-darts/shared` types and schemas
  rather than duplicating request payloads or Socket.IO event signatures in an app.
- Keep REST mutations broadcasting through `realtime/hub.ts` so console overview state remains
  synchronized. The live-score mirror is display-only and resets after each reported leg.
- **Do not add dependencies** without approval. Pin **exact** versions (`1.2.3`) — no
  carets, tildes, ranges, tags, or wildcards. Never hand-edit `yarn.lock`, and do not run
  `yarn up`, `yarn up -R`, or `npx` without explicit approval.
