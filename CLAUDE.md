# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this is

**pi-darts** is a touch-first darts scoreboard that runs full-screen on a Raspberry Pi
touchscreen. It is scored entirely by tapping — there is no hardware keyboard, so all text
input (player names) goes through an on-screen keyboard component.

Stack: **Vue 3** (`<script setup>`, composition API) + **Vite** + **TypeScript**, type-checked
with `vue-tsc`. No backend — it's a purely client-side app.

## Commands

```sh
yarn install         # install workspace dependencies
yarn dev:board       # board app with hot reload
yarn dev:console     # console app with hot reload
yarn dev:server      # server app with hot reload
yarn type-check      # repo-wide type-check (primary verification — see below)
yarn build           # type-check + frontend production builds
yarn preview:board   # serve the board production build
yarn preview:console # serve the console production build
yarn start:server    # run the server without the watcher
```

There is **no test runner** in this project. `yarn type-check` is the main automated
gate; verify UI/behavior by running the relevant `yarn dev:*` command and exercising the flow in
a browser.

## Architecture

Game logic is deliberately kept out of the components, in framework-light modules under
`src/game/`:

- **`src/game/useDartGame.ts`** — the core composable. Holds `phase` (`'setup' | 'playing'`),
  `players`, per-game `options` (`startScore`, `outMode`), the current turn's throws, finish
  order, and undo history. Exposes `throwDart`, `undo`, `startGame`, `backToSetup`,
  `continuePlaying`, and the `checkoutRoutes` computed. Constants: `THROWS_PER_TURN = 3`,
  `START_SCORES = [301, 501]`, `DEFAULT_OPTIONS`. `type OutMode = 'single' | 'double'`.
- **`src/game/checkout.ts`** — pure checkout solver. `suggestCheckouts(score, dartsLeft,
outMode)` returns up to 3 `CheckoutRoute`s; `dartLabel()` formats a dart (`T20`, `D16`,
  `Bull`). No Vue dependency.
- **`src/game/setupStorage.ts`** — `loadSetup()` / `saveSetup()` persist the roster
  (names + selected) and options to `localStorage` under key `pi-darts.setup.v1`. Defensive
  parsing; never throws.

UI components under `src/components/`:

- **`App.vue`** — root; switches between setup and game screens, renders the player board +
  number pad, and the finish / game-over / new-game-confirm overlays.
- **`SetupScreen.vue`** — roster editing, game options (gear ⚙️ overlay), and bull-out play
  order. Seeds from `setupStorage` and persists changes via a watcher.
- **`NumberPad.vue`** — the scoring pad. Its hint line doubles as the checkout display.
- **`PlayerBoard.vue`** — per-player cards (score, progress, this turn's darts).
- **`VirtualKeyboard.vue`** — on-screen keyboard for entering names.

`src/main.ts` mounts `App.vue` on `#app`.

## Domain rules

- A turn is up to 3 darts. Going below 0 is a **bust** (whole turn reverts).
- **Single-out:** finish on exactly 0 with any dart.
- **Double-out:** the finishing dart must be a double (incl. bull 50 = double-25); reaching 0
  on a non-double busts, and leaving a score of 1 busts.
- A dart is a "double" when `multiplier === 2`. Triple-25 is illegal.

## Conventions

- Match the surrounding style: `<script setup lang="ts">`, composition API, small focused
  components, dark slate/cyan theme.
- Comments explain **why**, not what; keep the existing density.
- This runs on a **touchscreen** — interactive controls should keep a comfortable finger
  target (~44–48px minimum). Don't shrink tap targets.
- Keep game logic in `src/game/` pure and UI-agnostic where practical.

## Constraints (dependencies & tooling)

- **Do not add dependencies** without explicit approval; nothing outside `package.json`.
- Pin **exact** versions (`1.2.3`) — no ranges/carets/tildes/tags/wildcards.
- Never hand-edit `yarn.lock`; never run `yarn up`/`yarn up -R` or `npx` without explicit
  confirmation.
