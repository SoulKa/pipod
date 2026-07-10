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
  <div v-if="detail" class="overview pd-stack">
    <header class="overview-heading pd-row">
      <h1>{{ detail.tournament.name }}</h1>
      <span :class="['dot', connected ? 'on' : 'off']">{{ connected ? 'live' : 'offline' }}</span>
    </header>

    <section v-if="liveMatches.length" class="live-grid">
      <div v-for="m in liveMatches" :key="m.id" class="pd-panel live-card">
        <div
          v-for="pid in [m.participantAId, m.participantBId]"
          :key="pid ?? 'x'"
          class="live-player"
        >
          <span class="pname">{{ nameOf(pid) }}</span>
          <span class="pscore">{{
            live.get(m.id)?.scores.find((s) => s.participantId === pid)?.remaining ?? m.startScore
          }}</span>
        </div>
        <div class="legs">
          legs {{ live.get(m.id)?.legsA ?? m.legsA }}–{{ live.get(m.id)?.legsB ?? m.legsB }}
        </div>
      </div>
    </section>
    <p v-else class="pd-muted">No matches in progress.</p>

    <div class="columns">
      <section class="pd-panel">
        <h2>Standings</h2>
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
              <td>{{ s.points }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-for="{ stage, matches } in stageGroups" :key="stage.id" class="pd-panel">
        <h2>{{ stage.name }}</h2>
        <div v-for="m in matches" :key="m.id" class="match-row">
          <span :class="{ win: m.winnerId === m.participantAId }">{{
            nameOf(m.participantAId)
          }}</span>
          <span class="score">{{ m.legsA }}–{{ m.legsB }}</span>
          <span :class="{ win: m.winnerId === m.participantBId }">{{
            nameOf(m.participantBId)
          }}</span>
        </div>
      </section>
    </div>
  </div>
  <p v-else class="pd-muted">Loading…</p>
</template>

<style scoped>
.overview {
  gap: var(--pd-space-5);
}

.overview-heading {
  justify-content: space-between;
  gap: var(--pd-space-3);
}

.dot {
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--pd-border-strong);
  color: var(--pd-text-muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.dot.on {
  border-color: var(--pd-success);
  background: var(--pd-success-soft);
  color: var(--pd-success);
}
.dot.off {
  border-color: var(--pd-danger);
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}

.live-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--pd-space-4);
}

.live-card {
  gap: var(--pd-space-3);
  border-color: rgba(34, 211, 238, 0.35);
  background:
    linear-gradient(145deg, rgba(34, 211, 238, 0.1), transparent 55%), var(--pd-surface-gradient);
}

.live-player {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--pd-space-3);
}

.pname {
  min-width: 0;
  overflow: hidden;
  color: var(--pd-text-soft);
  font-size: 1.15rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pscore {
  color: var(--pd-accent);
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 850;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.05em;
}

.legs {
  padding-top: var(--pd-space-2);
  border-top: 1px solid var(--pd-border);
  color: var(--pd-text-muted);
  text-align: right;
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--pd-space-4);
  align-items: start;
}

.match-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--pd-space-2);
  padding: var(--pd-space-2) 0;
  border-bottom: 1px solid var(--pd-border);
}

.match-row .score {
  color: var(--pd-text-muted);
  font-variant-numeric: tabular-nums;
}

.match-row span:last-child {
  text-align: right;
}

.win {
  color: var(--pd-success);
  font-weight: 700;
}

@media (max-width: 480px) {
  .live-grid,
  .columns {
    grid-template-columns: 1fr;
  }
}
</style>
