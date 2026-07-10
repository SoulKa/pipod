<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useTournamentFeed } from '../feed'

const props = defineProps<{ id: string }>()

const feed = useTournamentFeed()
const { detail, standings, live, connected } = feed

onMounted(() => feed.open(props.id))
onUnmounted(() => feed.close())

const nameOf = computed(() => {
  const map = new Map((detail.value?.participants ?? []).map((p) => [p.id, p.name]))
  return (id: string | null) => (id ? (map.get(id) ?? '—') : '—')
})

const liveMatches = computed(() => (detail.value?.matches ?? []).filter((m) => m.status === 'live'))

const stageGroups = computed(() =>
  (detail.value?.stages ?? []).map((stage) => ({
    stage,
    matches: (detail.value?.matches ?? []).filter((m) => m.stageId === stage.id),
  })),
)
</script>

<template>
  <div v-if="detail" class="overview">
    <header class="overview-heading">
      <div>
        <p class="eyebrow">Tournament overview</p>
        <h1>{{ detail.tournament.name }}</h1>
      </div>
      <span
        :class="[
          'connection-status',
          connected ? 'connection-status--on' : 'connection-status--off',
        ]"
      >
        <span class="connection-dot"></span>
        {{ connected ? 'Live feed' : 'Offline' }}
      </span>
    </header>

    <section class="live-zone">
      <div class="live-zone-heading">
        <div>
          <p class="eyebrow">Now playing</p>
          <h2>Live scores</h2>
        </div>
        <p class="pd-muted">
          {{ liveMatches.length ? `${liveMatches.length} live` : 'Waiting for a board' }}
        </p>
      </div>

      <div v-if="liveMatches.length" class="live-strip">
        <article v-for="m in liveMatches" :key="m.id" class="pd-panel live-card">
          <div class="live-player">
            <span class="pname">{{ nameOf(m.participantAId) }}</span>
            <strong class="pscore">{{
              live.get(m.id)?.scores.find((s) => s.participantId === m.participantAId)?.remaining ??
              m.startScore
            }}</strong>
          </div>
          <div class="live-divider">
            <span>vs</span>
            <strong class="legs"
              >{{ live.get(m.id)?.legsA ?? m.legsA }}–{{ live.get(m.id)?.legsB ?? m.legsB }}</strong
            >
          </div>
          <div class="live-player">
            <span class="pname">{{ nameOf(m.participantBId) }}</span>
            <strong class="pscore">{{
              live.get(m.id)?.scores.find((s) => s.participantId === m.participantBId)?.remaining ??
              m.startScore
            }}</strong>
          </div>
        </article>
      </div>
      <div v-else class="pd-panel pd-panel--compact live-empty">
        <p class="pd-muted">No matches are currently in progress.</p>
      </div>
    </section>

    <div class="overview-lower">
      <section class="pd-panel standings-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Rankings</p>
            <h2>Standings</h2>
          </div>
          <span class="pd-muted">{{ standings.length }} players</span>
        </div>
        <div class="standings-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>P</th>
                <th>W</th>
                <th>+/-</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in standings" :key="s.participantId">
                <td>{{ nameOf(s.participantId) }}</td>
                <td>{{ s.played }}</td>
                <td>{{ s.wins }}</td>
                <td>{{ s.legDiff }}</td>
                <td class="points">{{ s.points }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="stages-area">
        <div class="panel-heading stages-area-heading">
          <div>
            <p class="eyebrow">Draw</p>
            <h2>Stages & results</h2>
          </div>
          <span class="pd-muted">{{ stageGroups.length }} stages</span>
        </div>
        <div v-if="stageGroups.length" class="stage-grid">
          <section
            v-for="{ stage, matches } in stageGroups"
            :key="stage.id"
            class="pd-panel stage-card"
          >
            <div class="stage-card-heading">
              <div>
                <h3>{{ stage.name }}</h3>
                <p class="pd-muted">{{ stage.type }} · Bo{{ stage.bestOf }}</p>
              </div>
              <span class="match-count">{{ matches.length }} matches</span>
            </div>
            <div v-if="matches.length" class="match-list">
              <div v-for="m in matches" :key="m.id" class="match-row">
                <span :class="{ win: m.winnerId === m.participantAId }">{{
                  nameOf(m.participantAId)
                }}</span>
                <strong class="score">{{ m.legsA }}–{{ m.legsB }}</strong>
                <span :class="{ win: m.winnerId === m.participantBId }">{{
                  nameOf(m.participantBId)
                }}</span>
              </div>
            </div>
            <p v-else class="pd-muted">Matches have not been generated.</p>
          </section>
        </div>
        <div v-else class="pd-panel pd-panel--compact">
          <p class="pd-muted">Stages will appear here once they are configured.</p>
        </div>
      </section>
    </div>
  </div>
  <p v-else class="pd-muted loading">Loading tournament dashboard…</p>
</template>

<style scoped>
.overview {
  display: grid;
  gap: var(--pd-space-5);
}

.overview-heading,
.live-zone-heading,
.panel-heading,
.stage-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-4);
}

.overview-heading > div,
.live-zone-heading > div,
.panel-heading > div,
.stage-card-heading > div {
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

.connection-status,
.match-count {
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

.standings-table-wrap {
  overflow-x: auto;
}

.points {
  color: var(--pd-accent);
  font-weight: 800;
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

.stage-card {
  min-width: 0;
}

.stage-card-heading {
  align-items: start;
}

.match-count {
  color: var(--pd-text-muted);
}

.match-list {
  display: grid;
}

.match-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--pd-space-2);
  padding: var(--pd-space-2) 0;
  border-bottom: 1px solid var(--pd-border);
}

.match-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-row span:last-child {
  text-align: right;
}

.score {
  color: var(--pd-text-muted);
  font-variant-numeric: tabular-nums;
}

.win {
  color: var(--pd-success);
  font-weight: 700;
}

.loading {
  padding: var(--pd-space-6);
  text-align: center;
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

  .live-divider {
    grid-column: 1 / -1;
    grid-row: 2;
    grid-template-columns: auto auto;
    justify-content: start;
  }

  .stage-card-heading {
    flex-wrap: wrap;
  }
}
</style>
