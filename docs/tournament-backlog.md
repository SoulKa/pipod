# Tournament backlog

Planned features and polish for the tournament server (`standalone/server`) and console
(`standalone/console`). Move an item out once it ships.

## Viewer: show that it's alive when empty

The viewer (`/`, `LiveView.vue` / `OverviewView.vue`) currently shows a plain text line when no
tournament exists or no match is live. Replace it with an animation or spinner (for example a dart
flying at the board, or a pulsing "waiting for the first match" state) so spectators can tell the
screen is connected and working, not frozen. It should keep reflecting the live-feed connection
state, so a lost connection still looks different from "nothing happening yet".

## Fixed tournament phases: group → KO

Today a tournament has a free-form list of stages (`Stage.name`, `type`, `order`, created one by
one in the admin console). Simplify to a fixed shape:

- Exactly two possible phases, always in this order: **group phase**, then **KO phase**.
- Each can be toggled on or off per tournament, but at least one must be on.
- Phase names are fixed (no free-text name input); the UI derives labels from the type.
- The admin console's stage creation UI collapses to two toggles plus per-phase settings
  (best-of, start score, out mode, group count / qualifiers).

Touches the shared contract first (`packages/shared`: `createStageSchema`, `Stage`), then the
Drizzle schema + a migration, `services/tournaments.ts`, and the console's setup tab.

## Don't mix phases when assigning matches

Matches from different phases must never be assigned/played at the same time. A KO match may only
be started (assigned to a floor, claimed by a board, or auto-assigned) once every match of the group
phase is completed. Enforce this server-side in `services/matches.ts` / `services/scheduler.ts`
(manual assignment, claim and auto-assign), and reflect it in the console's schedule board (e.g.
lock KO matches with a hint until the group phase is done). Add e2e coverage in
`standalone/server/src/test/e2e/`.

## Smaller follow-ups

- The spectator viewer still renders inside the console shell (top bar with Admin link and the
  server-log feed). Consider a bare layout for `/` and `/view/:id` so phones don't subscribe to
  server logs.
- `LiveView` polls `/api/tournaments` every 15 s to notice a newly started tournament; a
  tournament-list socket event would make the switch instant.
