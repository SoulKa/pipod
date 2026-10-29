# Player profile pictures — design

## Intent

A fun, optional extra for tournament nights: any player can give themselves (or a friend) a
picture — a selfie or an emoji — from their own phone, at any time, in a few taps. The picture
then shows up whenever that player appears: most prominently on the board's "A vs B" match
intro, and as small avatars across the spectator viewer and admin console.

It is a gimmick. It must never get in the way of running a tournament, and nothing breaks or
looks unfinished when nobody uses it.

## Goals

- From the viewer (reached via the QR codes posted at the venue), tap any player → their
  profile page → take a photo with the phone's native camera, or pick an emoji, or remove it.
  Preview shows immediately; retake/change/remove at any time.
- Pictures appear on:
  - the board's match intro (`apps/board/src/components/MatchIntro.vue`), big;
  - the viewer: tables & schedule, knockout bracket, live-match card;
  - the admin console's participant list, where the admin can also remove a picture.
- Players without a picture get an initials avatar everywhere, so mixed matchups look
  deliberate.

## Non-goals

- No authentication, PIN or ownership. Anyone can change anyone's picture; pranks among friends
  are part of the fun (decided by the user).
- No cross-tournament identity: a participant only exists within one tournament, and so does
  their picture. It goes away with the tournament (intended).
- No in-app crop/zoom editor, filters or stickers. Bad framing → retake.
- Not shown on the board during play (scoreboard while scoring stays as-is).

## Anti-goals

- Touching offline/standalone board play in any way.
- Heavy infrastructure (SeaweedFS/S3, extra containers) for a few MB of selfies.
- Pictures bloating the realtime snapshot that every console/board receives.

## Constraints

- No new dependencies (CLAUDE.md). Everything below is doable with the platform: file input,
  `createImageBitmap`, `<canvas>`, Fastify's built-in body parsing, `Intl.Segmenter`.
- The viewer is served over plain HTTP on the LAN, so `getUserMedia` is unavailable (needs a
  secure context). The native camera via `<input type="file" accept="image/*" capture="user">`
  works over HTTP and is what the user asked for.
- The viewer only ever runs on phones/computers, never on the Pi → it uses native inputs, not
  `TouchTextInput` (now documented in CLAUDE.md). The Pi has a color emoji font installed.
- `@pipod/shared` changes first, then server, console and board together.
- Board is an app under `apps/*` → bump its `package.json` version (minor) if not already bumped
  since the last tag. No launcher app-facing surface changes.

## Decisions (made with the user)

- **Storage: SQLite.** Photos live in the existing DB, in their own table, not on the
  filesystem or in object storage. One file to back up, no Docker volume changes, and deleting a
  participant/tournament deletes its photos in the same transaction.
- **Photo size: 512×512.** The phone center-crops to a square and downscales to 512×512 JPEG
  before upload (≈60–150 KB).
- **Emoji: any single emoji**, entered with the phone's own emoji keyboard, plus a row of quick
  picks. Server validates "exactly one emoji".
- **One picture kind at a time**: photo _or_ emoji _or_ none. Setting one replaces the other.
- **Placements:** match intro, viewer tables & schedule, viewer bracket, viewer live match,
  admin console (with remove).

## Design

### Contract (`packages/shared`)

```ts
export type ParticipantAvatar =
  { kind: 'emoji'; emoji: string } | { kind: 'photo'; version: string } // hash of the photo bytes → cache-busting URL

export interface Participant {
  // …existing fields
  avatar: ParticipantAvatar | null
}
```

- `setAvatarEmojiSchema = z.object({ emoji: z.string().refine(isSingleEmoji) })`.
- `isSingleEmoji(s)`: exactly one grapheme (`Intl.Segmenter`, granularity `grapheme`) that
  matches `/\p{Extended_Pictographic}|\p{Regional_Indicator}/u`. So 👨‍👩‍👧, 🇩🇪, 👍🏽 pass; "lol",
  "🍺🍺", "1" fail. Exported for client-side validation too. Unit-tested.
- `avatarPhotoUrl(origin, participantId, version)` helper →
  `${origin}/api/participants/${id}/avatar?v=${version}` so all clients build it identically.
- Photo constants: `AVATAR_PHOTO_SIZE = 512`, `AVATAR_PHOTO_MAX_BYTES = 1024 * 1024`.

### Server (`standalone/server`)

Schema (`src/db/schema.ts`, then `db:generate`):

- `participants`: add a nullable JSON `avatar` column (`text({ mode: 'json' })` typed as
  `ParticipantAvatar`), so a participant can hold a photo or an emoji but never both.
- New `participant_photos` table: `participant_id text primary key` referencing
  `participants.id` with `ON DELETE CASCADE` (the schema's first foreign key), and
  `data blob not null` (Drizzle `blob({ mode: 'buffer' })`).

The row shape is the domain shape, so the repo needs no mapping. The blob is never selected
there, so snapshots stay small. `setAvatarPhoto`, `setAvatarEmoji` and `clearAvatar` share one
private write path that updates the column and the photo row in one transaction.

Routes:

| Method   | Path                                 | Body                   | Effect                                                                                                                     |
| -------- | ------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `PUT`    | `/api/participants/:id/avatar/photo` | raw `image/jpeg` bytes | upsert photo row, version = SHA-1 of the bytes (16 hex), clear emoji                                                       |
| `PUT`    | `/api/participants/:id/avatar/emoji` | `{ emoji }`            | set emoji, delete photo row, clear version                                                                                 |
| `DELETE` | `/api/participants/:id/avatar`       | —                      | clear both, delete photo row                                                                                               |
| `GET`    | `/api/participants/:id/avatar`       | —                      | serve JPEG; `Cache-Control: public, max-age=31536000, immutable` only when `?v` matches the current version; 404 otherwise |

- Register an `image/jpeg` content-type parser (`parseAs: 'buffer'`) with
  `bodyLimit: AVATAR_PHOTO_MAX_BYTES`. Reject non-JPEG by checking the `FF D8 FF` magic bytes.
  The server does not decode or resize — the client did; the byte cap bounds abuse.
- Every mutation calls `broadcastSnapshot(tournamentId)` so viewer, console and boards update
  live.
- `deleteParticipant` and `deleteTournament` also delete matching `participant_photos` rows
  (same transaction).
- 404 for unknown participant. Allowed in any tournament status, including completed (my call —
  harmless, and fun on the results screen).

### Viewer (`standalone/console`, bare routes)

- New bare route `/view/:id/player/:participantId` → `PlayerProfileView.vue`.
- **Entry points:** a "Spieler" section in the viewer listing every participant with avatar
  (the obvious "find yourself" spot), and tapping any player name/avatar in tables, schedule,
  bracket or live card opens that profile. From `/` (live), links go to the pinned tournament's
  profile route; a back button returns to where they came from.
- **Profile page:** big avatar preview (photo, emoji, or initials), name, and:
  - "Foto aufnehmen" — hidden `<input type="file" accept="image/*" capture="user">`. On change:
    `createImageBitmap(file)` (honours EXIF orientation), center square crop, draw to a 512×512
    canvas, `toBlob('image/jpeg', 0.85)`, `PUT` it. Show the local preview immediately, a
    spinner until the upload completes, and an error message + retry on failure.
  - "Foto hochladen" — same pipeline, but the input has no `capture`, so the phone offers its
    gallery (on iOS `capture` jumps straight into the camera with no gallery option).
  - Emoji: a native `<input>` (opens the phone keyboard, emoji tab is a tap away) plus a row of
    ~12 quick picks (🍺 🐻 🦊 🐙 🦄 🐸 🎯 🔥 👑 🤡 🐐 🦈 — my pick, easy to change). Saved on pick
    / on a valid single emoji; invalid input shows a hint and isn't sent.
  - "Entfernen" when a picture is set.
- Strings in German, matching the existing UI.

### Shared avatar component (`@pipod/ui`)

`PlayerAvatar.vue` with props `participant`, `size` and `origin` (server origin; empty in the
console, the server URL on the board): renders photo (`<img>` with the
versioned URL, `loading="lazy"`), emoji (centered, sized to the circle), or initials (first
letters of up to two words, on a color derived from the participant id so each player has a
stable tint). Circular. Used by all viewer placements and the admin list. In the admin list each
row gets a small "Bild entfernen" button when a picture is set.

Placements in existing components: `OverviewView.vue` (live card, tables, schedule/results),
`BracketTree.vue`, `ScheduleBoard.vue`, `AdminView.vue` participant list. Small avatars must not
change row heights noticeably or break the bracket layout.

### Board (`apps/board`)

- `MatchIntro.vue` takes `players: [{ name, avatar, id }, …]` (instead of `names`) plus the
  server origin, and renders a large circular avatar (≈160–200px) above each name plate,
  animating in with its plate. Initials fallback, same rules as the console (logic duplicated in
  a tiny pure helper in `@pipod/shared` — `avatarInitials(name)` — so both match).
- `TournamentBoard.vue` already has `participants` from the assignment payload; it builds the
  intro players from it. The assignment refreshes on snapshot, so a picture changed while the
  intro is showing updates in place.
- A broken/slow image falls back to initials (`@error`), never blocks "Game on!".
- No avatars on the scoring screen. Offline play untouched.
- Bump `apps/board/package.json` (minor).

## Testing

- `@pipod/shared`: `isSingleEmoji` (ZWJ sequences, flags, skin tones, text, multiple emoji,
  empty), `avatarInitials`.
- Server (vitest): each route — upload sets version and clears emoji, emoji clears photo, delete
  clears both, GET serves bytes with cache headers / 404, non-JPEG and oversize rejected, unknown
  participant 404, snapshot broadcast on each, photos deleted with participant and tournament.
- Server e2e (`src/test/e2e/`): extend a case so a board receives a participant with `avatar`
  in its assignment after a viewer sets one (snapshot contract change).
- Console: `PlayerAvatar` renders the three kinds; profile view emits the right API calls for
  emoji pick / remove (mock the crop pipeline — canvas isn't real under happy-dom).
- Board: `MatchIntro` renders avatar vs. initials.
- Manual: real phone (iOS Safari + Android Chrome) over LAN HTTP — camera opens, orientation
  correct, upload works; check the intro on the Pi.

## Left to the builder

- Exact visual styling of avatars, the profile page and the "Spieler" section (dark slate/cyan
  theme, ≥44px tap targets).
- Migration naming, error copy, quick-pick list tweaks.
