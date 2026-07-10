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
    <header class="row" style="justify-content: space-between">
      <h1>{{ detail.tournament.name }}</h1>
      <span :class="['dot', connected ? 'on' : 'off']">{{ connected ? 'live' : 'offline' }}</span>
    </header>

    <section v-if="liveMatches.length" class="live-grid">
      <div v-for="m in liveMatches" :key="m.id" class="panel live-card">
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
    <p v-else class="muted">No matches in progress.</p>

    <div class="columns">
      <section class="panel stack">
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

      <section v-for="{ stage, matches } in stageGroups" :key="stage.id" class="panel stack">
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
  <p v-else class="muted">Loading…</p>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dot {
  font-size: 0.85rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.dot.on {
  color: var(--good);
  border-color: var(--good);
}
.dot.off {
  color: var(--bad);
  border-color: var(--bad);
}

.live-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.live-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.live-player {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.pname {
  font-size: 1.4rem;
  font-weight: 600;
}

.pscore {
  font-size: 2.6rem;
  font-weight: 800;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.legs {
  color: var(--muted);
  text-align: right;
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  align-items: start;
}

.match-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border);
}

.match-row .score {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.match-row span:last-child {
  text-align: right;
}

.win {
  color: var(--good);
  font-weight: 700;
}
</style>
