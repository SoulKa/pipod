<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import type { Match } from '@pipod/shared'
import { useTournamentFeed } from '../feed'
import { buildBracketRounds, championOf } from '../bracket'
import { phaseLabel } from '../phases'
import { useMediaQuery } from '../media'
import { upNextMatches } from '../upNext'
import { currentPhaseTab, PLAYERS_TAB, ROTATE_MS, TABLE_TAB, useViewerTabs } from '../viewerTabs'
import IdleBoard from '../components/IdleBoard.vue'
import PlayerGrid from '../components/PlayerGrid.vue'
import PlayerTag from '../components/PlayerTag.vue'
import StageCard from '../components/StageCard.vue'
import StandingsTable from '../components/StandingsTable.vue'
import { provideParticipants } from '../participants'
import ViewerQrButton from '../components/ViewerQrButton.vue'
import ViewerQrTile from '../components/ViewerQrTile.vue'

const props = defineProps<{
  id: string
  /** Where the QR code points; `/` keeps following whichever tournament is active. */
  qrPath?: string
}>()

const feed = useTournamentFeed()
const { detail, standings, live, connected, nameOf } = feed

onMounted(() => feed.open(props.id))
onUnmounted(() => feed.close())

provideParticipants(feed)

const liveMatches = computed(() => (detail.value?.matches ?? []).filter((m) => m.status === 'live'))

const stageGroups = computed(() =>
  (detail.value?.stages ?? []).map((stage) => ({
    stage,
    matches: (detail.value?.matches ?? []).filter((m) => m.stageId === stage.id),
  })),
)

const isCompleted = computed(() => detail.value?.tournament.status === 'completed')

/** Before the first result the idle screen says so, rather than "next match". */
const nothingPlayed = computed(
  () => !(detail.value?.matches ?? []).some((m) => m.status === 'completed' && m.legsA + m.legsB),
)

/**
 * The tournament winner is whoever won the knockout final. A group-only tournament has
 * no such match, so the standings table speaks for it.
 */
const champion = computed(() => {
  if (!isCompleted.value) return null
  const knockout = stageGroups.value.find((s) => s.stage.type === 'knockout')
  return knockout ? championOf(buildBracketRounds(knockout.matches)) : null
})

const remaining = (m: Match, participantId: string | null): number =>
  live.value.get(m.id)?.scores.find((s) => s.participantId === participantId)?.remaining ??
  m.startScore
const legsA = (m: Match): number => live.value.get(m.id)?.legsA ?? m.legsA
const legsB = (m: Match): number => live.value.get(m.id)?.legsB ?? m.legsB

/**
 * A laptop on the TV gets a single screen with no page scroll. Everyone watching is in the
 * same flat and can walk over to a running game, so the screen leads with how the
 * tournament stands; a side column says what is being played where and who is up next,
 * since the viewers are the players waiting for their turn. Players set their pictures
 * from their phones, so on the big screen they only need a tab. Short windows keep the
 * stacked layout, where too little would fit at once.
 */
const wide = useMediaQuery('(min-width: 64rem) and (min-height: 36rem)')

const hasGroupPhase = computed(() => stageGroups.value.some((g) => g.stage.type === 'group'))

const tabItems = computed(() => {
  const participants = detail.value?.participants.length ?? 0
  return [
    ...stageGroups.value.map(({ stage }) => ({ id: stage.id, label: phaseLabel(stage.type) })),
    // The group phase tab carries the table; without one it needs its own.
    ...(participants && !hasGroupPhase.value ? [{ id: TABLE_TAB, label: 'Tabelle' }] : []),
    ...(participants ? [{ id: PLAYERS_TAB, label: 'Spieler' }] : []),
  ]
})

const {
  active: activeTab,
  select: selectTab,
  autoRotate,
  toggleAutoRotate,
  cycle,
} = useViewerTabs({
  tabs: () => tabItems.value.map((t) => t.id),
  current: () => currentPhaseTab(detail.value?.stages ?? [], detail.value?.matches ?? []),
  enabled: () => wide.value,
})

const activeStage = computed(() => stageGroups.value.find((g) => g.stage.id === activeTab.value))

const floorName = (floorId: string | null): string =>
  detail.value?.floors.find((f) => f.id === floorId)?.name ?? 'Noch ohne Board'

const UP_NEXT_SHOWN = 6
const upNext = computed(() => upNextMatches(detail.value?.matches ?? []))
</script>

<template>
  <div v-if="detail" :class="wide ? 'overview overview--wide' : 'overview'">
    <header class="overview-heading">
      <div>
        <p class="eyebrow">Turnierübersicht</p>
        <h1>{{ detail.tournament.name }}</h1>
      </div>
      <div class="overview-badges">
        <span v-if="isCompleted" class="completed-chip">
          🏆 Turnier beendet<template v-if="champion"> · Sieger: {{ nameOf(champion) }}</template>
        </span>
        <span
          :class="[
            'connection-status',
            connected ? 'connection-status--on' : 'connection-status--off',
          ]"
        >
          <span class="connection-dot"></span>
          {{ connected ? 'Live-Feed' : 'Offline' }}
        </span>
        <ViewerQrTile v-if="wide" :path="qrPath ?? `/view/${id}`" />
        <ViewerQrButton v-else :path="qrPath ?? `/view/${id}`" />
      </div>
    </header>

    <div v-if="wide" class="board-layout">
      <section class="outcome">
        <div class="outcome-bar">
          <div class="viewer-tabs" role="tablist" aria-label="Turnierbereich">
            <button
              v-for="tab in tabItems"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.id"
              :class="activeTab === tab.id ? 'viewer-tab viewer-tab--active' : 'viewer-tab'"
              @click="selectTab(tab.id)"
            >
              {{ tab.label }}
              <!-- Keyed by the interval, so the bar restarts whenever the timer does. -->
              <span
                v-if="autoRotate && activeTab === tab.id && tabItems.length > 1"
                :key="cycle"
                class="viewer-tab-progress"
                :style="{ animationDuration: `${ROTATE_MS}ms` }"
              ></span>
            </button>
          </div>
          <button
            v-if="tabItems.length > 1"
            type="button"
            :class="autoRotate ? 'rotate-toggle rotate-toggle--on' : 'rotate-toggle'"
            :aria-pressed="autoRotate"
            aria-label="Bereiche automatisch durchwechseln"
            :title="
              autoRotate
                ? 'Automatischer Wechsel an — klicken zum Anhalten'
                : 'Bereiche automatisch durchwechseln'
            "
            @click="toggleAutoRotate"
          >
            <!-- Shows what a click does, like any slideshow: pause while it rotates. -->
            <svg v-if="autoRotate" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"
              />
            </svg>
          </button>
        </div>

        <div v-if="activeStage?.stage.type === 'group'" class="outcome-body group-tab">
          <section class="pd-panel standings-panel">
            <h2>Tabelle</h2>
            <StandingsTable :standings="standings" />
          </section>
          <StageCard
            :stage="activeStage.stage"
            :matches="activeStage.matches"
            :live="live"
            :after-groups="false"
          />
        </div>
        <div v-else-if="activeStage" class="outcome-body">
          <StageCard
            :stage="activeStage.stage"
            :matches="activeStage.matches"
            :live="live"
            :after-groups="hasGroupPhase"
          />
        </div>
        <div v-else-if="activeTab === TABLE_TAB" class="outcome-body">
          <section class="pd-panel standings-panel">
            <h2>Tabelle</h2>
            <StandingsTable :standings="standings" />
          </section>
        </div>
        <div v-else-if="activeTab === PLAYERS_TAB" class="outcome-body">
          <section class="pd-panel tab-players">
            <p class="pd-muted">
              QR-Code scannen und auf deinen Namen tippen, um ein Foto oder Emoji zu setzen.
            </p>
            <PlayerGrid :participants="detail.participants" />
          </section>
        </div>
        <div v-else class="outcome-body">
          <div class="pd-panel pd-panel--compact">
            <p class="pd-muted">Phasen erscheinen hier, sobald sie konfiguriert sind.</p>
          </div>
        </div>
      </section>

      <aside class="pd-panel side-panel">
        <section class="side-section">
          <p class="eyebrow">Jetzt am Spielen</p>
          <article v-for="m in liveMatches" :key="m.id" class="side-live">
            <p class="side-live-meta">
              <span>{{ floorName(m.floorId) }}</span>
              <strong>{{ legsA(m) }}–{{ legsB(m) }}</strong>
            </p>
            <div class="side-live-player">
              <PlayerTag :id="m.participantAId" :size="28" />
              <strong>{{ remaining(m, m.participantAId) }}</strong>
            </div>
            <div class="side-live-player">
              <PlayerTag :id="m.participantBId" :size="28" />
              <strong>{{ remaining(m, m.participantBId) }}</strong>
            </div>
          </article>
          <p v-if="!liveMatches.length" class="pd-muted side-empty">
            {{ isCompleted ? 'Turnier beendet.' : 'Gerade läuft kein Match.' }}
          </p>
        </section>

        <section v-if="!isCompleted" class="side-section">
          <p class="eyebrow">Als Nächstes</p>
          <ol v-if="upNext.length" class="side-next">
            <li v-for="m in upNext.slice(0, UP_NEXT_SHOWN)" :key="m.id">
              <span class="side-next-floor">{{ floorName(m.floorId) }}</span>
              <PlayerTag :id="m.participantAId" :size="20" />
              <PlayerTag :id="m.participantBId" :size="20" />
            </li>
          </ol>
          <p v-else class="pd-muted side-empty">Noch keine Matches angesetzt.</p>
          <p v-if="upNext.length > UP_NEXT_SHOWN" class="pd-muted side-more">
            + {{ upNext.length - UP_NEXT_SHOWN }} weitere
          </p>
        </section>
      </aside>
    </div>

    <template v-else>
      <section class="live-zone">
        <div class="live-zone-heading">
          <div>
            <p class="eyebrow">Jetzt am Spielen</p>
            <h2>Live-Ergebnisse</h2>
          </div>
          <p class="pd-muted">
            {{
              liveMatches.length
                ? `${liveMatches.length} live`
                : isCompleted
                  ? 'Alle Matches gespielt'
                  : 'Warten auf ein Board'
            }}
          </p>
        </div>

        <div v-if="liveMatches.length" class="live-strip">
          <article v-for="m in liveMatches" :key="m.id" class="pd-panel live-card">
            <div class="live-player">
              <PlayerTag class="pname" :id="m.participantAId" :size="40" />
              <strong class="pscore">{{ remaining(m, m.participantAId) }}</strong>
            </div>
            <div class="live-divider">
              <span>vs</span>
              <strong class="legs">{{ legsA(m) }}–{{ legsB(m) }}</strong>
            </div>
            <div class="live-player">
              <PlayerTag class="pname" :id="m.participantBId" :size="40" />
              <strong class="pscore">{{ remaining(m, m.participantBId) }}</strong>
            </div>
          </article>
        </div>
        <div v-else-if="isCompleted" class="pd-panel pd-panel--compact live-empty">
          <p class="pd-muted">Turnier beendet.</p>
        </div>
        <div v-else class="pd-panel pd-panel--compact live-empty">
          <IdleBoard
            :connected="connected"
            :title="nothingPlayed ? 'Warte auf das erste Match…' : 'Warte auf das nächste Match…'"
          />
        </div>
      </section>

      <section v-if="detail.participants.length" class="pd-panel players-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Profilbilder</p>
            <h2>Spieler</h2>
          </div>
          <span class="pd-muted">Tippe auf deinen Namen für ein Foto oder Emoji</span>
        </div>
        <PlayerGrid :participants="detail.participants" />
      </section>

      <div class="overview-lower">
        <section class="pd-panel standings-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Rangliste</p>
              <h2>Tabelle</h2>
            </div>
            <span class="pd-muted">{{ standings.length }} Spieler</span>
          </div>
          <StandingsTable :standings="standings" />
        </section>

        <section class="stages-area">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Auslosung</p>
              <h2>Phasen & Ergebnisse</h2>
            </div>
            <span class="pd-muted">{{ stageGroups.length }} Phasen</span>
          </div>
          <div v-if="stageGroups.length" class="stage-grid">
            <StageCard
              v-for="{ stage, matches } in stageGroups"
              :key="stage.id"
              :stage="stage"
              :matches="matches"
              :live="live"
              :after-groups="hasGroupPhase"
            />
          </div>
          <div v-else class="pd-panel pd-panel--compact">
            <p class="pd-muted">Phasen erscheinen hier, sobald sie konfiguriert sind.</p>
          </div>
        </section>
      </div>
    </template>
  </div>
  <p v-else class="pd-muted loading">Turnier-Dashboard wird geladen…</p>
</template>

<style scoped>
.overview {
  display: grid;
  gap: var(--pd-space-5);
}

.overview-heading,
.live-zone-heading,
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-4);
}

.overview-heading > div:first-child,
.live-zone-heading > div,
.panel-heading > div {
  display: grid;
  gap: var(--pd-space-1);
}

.eyebrow {
  color: var(--pd-accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.overview-badges {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pd-space-2);
}

.completed-chip,
.connection-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--pd-space-2);
  padding: var(--pd-space-1) var(--pd-space-2);
  border: 1px solid var(--pd-border-strong);
  border-radius: var(--pd-radius-sm);
  color: var(--pd-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.completed-chip {
  border-color: var(--pd-success);
  background: var(--pd-success-soft);
  color: var(--pd-success);
}

.connection-status--on {
  border-color: var(--pd-success);
  background: var(--pd-success-soft);
  color: var(--pd-success);
}

.connection-status--off {
  border-color: var(--pd-danger);
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}

.connection-dot {
  width: var(--pd-space-2);
  height: var(--pd-space-2);
  border-radius: var(--pd-radius-lg);
  background: currentcolor;
}

.live-zone {
  display: grid;
  gap: var(--pd-space-3);
}

.live-strip {
  display: grid;
  grid-auto-columns: minmax(20rem, 1fr);
  grid-auto-flow: column;
  gap: var(--pd-space-4);
  overflow-x: auto;
  padding-bottom: var(--pd-space-1);
}

.live-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--pd-space-3);
  min-height: 9.5rem;
  border-color: var(--pd-border-accent);
  background: var(--pd-surface-gradient);
}

.live-player {
  display: grid;
  min-width: 0;
  gap: var(--pd-space-2);
}

.live-player:last-child {
  text-align: right;
}

.live-player:last-child .pname {
  justify-self: end;
}

.pname {
  overflow: hidden;
  color: var(--pd-text-soft);
  font-size: 1.05rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pscore {
  color: var(--pd-accent);
  font-size: clamp(2.5rem, 4vw, 4.25rem);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.06em;
  line-height: 0.9;
}

.live-divider {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-2);
  color: var(--pd-text-dim);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.legs {
  color: var(--pd-text);
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.live-empty {
  min-height: 6rem;
  justify-content: center;
}

.overview-lower {
  display: grid;
  gap: var(--pd-space-5);
  align-items: start;
}

.standings-panel {
  min-width: 0;
}

.stages-area {
  display: grid;
  min-width: 0;
  gap: var(--pd-space-3);
}

.stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
  gap: var(--pd-space-4);
  align-items: start;
}

.loading {
  padding: var(--pd-space-6);
  text-align: center;
}

/*
 * Single screen: the page itself never scrolls (the console content sizes it to the
 * window, see main.css); a panel that outgrows its share scrolls on its own instead.
 */
.overview--wide {
  flex: 1;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--pd-space-4);
}

.board-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem);
  gap: var(--pd-space-4);
  min-height: 0;
}

.outcome {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--pd-space-3);
  min-width: 0;
  min-height: 0;
}

.outcome-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-3);
}

.outcome-body {
  display: grid;
  min-height: 0;
}

/* Each panel scrolls inside its share of the screen rather than growing the page. */
.outcome-body > * {
  min-height: 0;
  overflow: auto;
}

.overview--wide .overview-badges {
  flex-wrap: nowrap;
}

.overview--wide .standings-panel {
  position: static;
}

.group-tab {
  grid-template-columns: minmax(18rem, 1fr) minmax(0, 1.4fr);
  gap: var(--pd-space-4);
}

.viewer-tabs {
  display: inline-flex;
  max-width: 100%;
  padding: var(--pd-space-1);
  overflow-x: auto;
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius);
  background: var(--pd-surface-sunken);
}

.viewer-tab {
  position: relative;
  min-width: 8rem;
  overflow: hidden;
  border-color: transparent;
  background: transparent;
  color: var(--pd-text-muted);
}

.viewer-tab--active {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
}

/* Fills up while auto-rotation waits, so the room can see the next switch coming. */
.viewer-tab-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--pd-accent);
  transform-origin: left;
  animation: tab-progress linear forwards;
}

@keyframes tab-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .viewer-tab-progress {
    display: none;
  }
}

.rotate-toggle {
  display: inline-grid;
  width: 2.75rem;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  color: var(--pd-text-muted);
}

.rotate-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: currentcolor;
}

.rotate-toggle--on {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
}

.side-panel {
  gap: var(--pd-space-5);
  min-height: 0;
  overflow: auto;
}

.side-section {
  display: grid;
  gap: var(--pd-space-2);
}

.side-live {
  display: grid;
  gap: var(--pd-space-2);
  padding: var(--pd-space-3);
  border: 1px solid var(--pd-border-accent);
  border-radius: var(--pd-radius);
  background: var(--pd-surface-sunken);
}

.side-live-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--pd-space-2);
  color: var(--pd-text-muted);
  font-size: 0.8rem;
  font-weight: 700;
}

.side-live-meta strong {
  color: var(--pd-text);
  font-variant-numeric: tabular-nums;
}

.side-live-player {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-2);
}

.side-live-player strong {
  color: var(--pd-accent);
  font-size: 1.75rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.side-next {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.side-next li {
  display: grid;
  gap: var(--pd-space-1);
  padding: var(--pd-space-2) 0;
  border-bottom: 1px solid var(--pd-border);
}

.side-next-floor {
  color: var(--pd-text-dim);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.side-empty,
.side-more {
  font-size: 0.9rem;
}

@media (min-width: 75rem) {
  .overview-lower {
    grid-template-columns: minmax(20rem, 0.8fr) minmax(0, 2fr);
  }

  .standings-panel {
    position: sticky;
    top: calc(4.5rem + var(--pd-space-4));
  }
}

@media (max-width: 40rem) {
  .overview-heading,
  .live-zone-heading,
  .panel-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .live-strip {
    grid-auto-columns: minmax(17rem, 88vw);
  }

  .live-card {
    grid-template-columns: 1fr auto;
    min-height: 0;
  }

  .live-player:last-child {
    text-align: left;
  }

  .live-player:last-child .pname {
    justify-self: start;
  }

  .live-divider {
    grid-column: 1 / -1;
    grid-row: 2;
    grid-template-columns: auto auto;
    justify-content: start;
  }
}
</style>
