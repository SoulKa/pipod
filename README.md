# 📟 piPod

A touch-first **app platform for the Raspberry Pi**. An Electron launcher runs full-screen on
the Pi's touchscreen and presents a home screen of installable apps, an app store, and settings —
each app launches in its own view. Built with Vue 3 + Vite; scored/driven entirely by tapping.

## Apps & workspaces

- **`apps/board`** — the touch-first darts scoreboard. Start from **301**/**501** with
  **single-out** or **double-out** rules, any number of players, per-turn undo, bull-out ordering,
  and live checkout suggestions. Plays offline standalone or joins a tournament.
- **`apps/dashboard`** — a kiosk dashboard: current weather + forecast (Open-Meteo) and Stuttgart
  VVS transit departures. Pure static SPA, no backend.
- **`standalone/console`** — Vue Router tournament management/overview app.
- **`standalone/server`** — Fastify + Socket.IO tournament server on a single port; SQLite via
  Drizzle.
- **`standalone/launcher`** — the Electron shell that installs/updates app bundles and launches
  each as a `WebContentsView`.
- **`packages/shared`** (`@pipod/shared`) — domain models, Zod schemas, and Socket.IO event maps
  shared by everything above.

## Tech stack

- [Vue 3](https://vuejs.org/) (`<script setup>`, composition API)
- [Vite](https://vite.dev/) for dev/build, [Electron](https://www.electronjs.org/) for the launcher
- TypeScript, type-checked with `vue-tsc`

## Project setup

```sh
yarn install
```

### Develop (hot reload)

```sh
yarn dev:board
yarn dev:dashboard
yarn dev:console
yarn dev:server
yarn dev:launcher
```

### Type-check

```sh
yarn type-check
```

### Format

```sh
yarn format
yarn format:check
```

### Build for production

```sh
yarn build            # type-check + build board & console
yarn build:launcher   # package the Electron launcher
yarn prepare-seed     # build store apps + regenerate the launcher's seed manifest
```

## Running on the Raspberry Pi

The launcher is the entry point on the Pi: it installs the seeded app bundles on first run and
self-updates them from the GitHub Release the launcher points at (`GITHUB_OWNER`/`GITHUB_REPO` in
`standalone/launcher/src/main/config.ts`). The UI targets the Pi's portrait touchscreen and
assumes touch input.

## Running the tournament server

```sh
yarn build          # builds the console the server hosts
yarn start:server   # logs the admin link + a viewer QR code, opens /admin in the browser
```

The server listens on port **3000** (`PORT=…` to change it); links and QR codes always carry the
port it is on, so spectators just scan or open the shared link. `OPEN_BROWSER=0` skips opening
the browser.

- **Windows:** allow node through the firewall prompt on first start, and make sure the network
  is set to _Private_, or other devices can't connect.
- **Docker:** `PUBLIC_URL=http://<host-lan-ip> docker compose up`. The server is reachable on
  both port 80 and 3000. The container can't see the host's LAN IP, so links and QR codes need
  `PUBLIC_URL`.

## Requirements

- Node.js `^22.18.0 || >=24.12.0` (see `engines` in `package.json`)
- Yarn `4.17.1` (via the `packageManager` field in `package.json`)

Yarn replaces npm in this repo, but it does **not** replace Node.js. Node is still required to run
Vite, TypeScript, Electron, and the server-side tooling.
