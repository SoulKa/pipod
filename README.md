# 🎯 pi-darts

A touch-first darts scoreboard for the Raspberry Pi. Built with Vue 3 + Vite, it runs
full-screen on the Pi's touchscreen and is scored entirely by tapping — no hardware keyboard
required.

## Features

- **Game modes** — start from **301** or **501**, with **single-out** or **double-out**
  finishing rules (full standard checkout rules: must finish on a double, leaving 1 busts).
  Configurable from the gear (⚙️) on the setup screen.
- **Any number of players** — add, rename, remove, and select players. The roster and options
  are **persisted** across sessions (via `localStorage`), so the app comes back up with your
  regulars already there.
- **Bull-out ordering** — set the play order by tapping names; the name row stays put and
  scrolls horizontally for long rosters.
- **Checkout suggestions** — while you throw, the number pad shows up to three ways to finish
  from the current score, respecting the active out mode and darts left in the turn.
- **Turn handling** — 3 darts per turn, bust detection, per-turn undo, and finish/placement
  overlays for multi-player games.
- **Touchscreen-friendly** — large tap targets sized for finger input, an on-screen keyboard
  for naming, and a confirmation guard before a "New Game" discards an in-progress match.

## Tech stack

- [Vue 3](https://vuejs.org/) (`<script setup>`, composition API)
- [Vite](https://vite.dev/) for dev/build
- TypeScript, type-checked with `vue-tsc`

Game logic lives in [`src/game/`](src/game/) as framework-agnostic modules
(`useDartGame.ts`, `checkout.ts`, `setupStorage.ts`); the UI is a small set of components
under [`src/components/`](src/components/).

## Project setup

```sh
yarn install
```

### Develop (hot reload)

```sh
yarn dev:board
yarn dev:console
yarn dev:server
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
yarn build
```

Preview the frontends locally with:

```sh
yarn preview:board
yarn preview:console
```

Run the server without the watcher with:

```sh
yarn start:server
```

## Running on the Raspberry Pi

Serve the contents of `dist/` (any static server works) and open it full-screen in the Pi's
browser (e.g. Chromium in kiosk mode) pointed at the local URL. The UI is designed for the
Pi's touchscreen resolution and assumes touch input.

## Requirements

- Node.js `^22.18.0 || >=24.12.0` (see `engines` in `package.json`)
- Yarn `4.17.1` (via the `packageManager` field in `package.json`)

Yarn replaces npm in this repo, but it does **not** replace Node.js. Node is still required to
run Vite, TypeScript, and the server-side tooling.
