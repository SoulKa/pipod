<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import type { OutMode, StageType, StartScore, Tournament } from '@pi-darts/shared'
import { api } from '../api'
import { useTournamentFeed } from '../feed'

const tournaments = ref<Tournament[]>([])
const feed = useTournamentFeed()
const { detail, live } = feed
const selectedId = ref<string | null>(null)
const error = ref('')

const newTournamentName = ref('')
const newParticipant = reactive({ name: '', seed: '' })
const newStage = reactive({
  name: '',
  type: 'group' as StageType,
  bestOf: 3,
  startScore: 501 as StartScore,
  outMode: 'double' as OutMode,
})
const genOpts = reactive({ groupCount: 2, qualifiersPerGroup: 2 })

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function loadTournaments() {
  tournaments.value = await api.listTournaments()
}
loadTournaments()

async function select(id: string) {
  selectedId.value = id
  feed.close()
  await feed.open(id)
}

const nameOf = computed(() => {
  const map = new Map((detail.value?.participants ?? []).map((p) => [p.id, p.name]))
  return (id: string | null) => (id ? (map.get(id) ?? '—') : '—')
})

const stagesWithMatches = computed(() =>
  (detail.value?.stages ?? []).map((stage) => ({
    stage,
    matches: (detail.value?.matches ?? []).filter((m) => m.stageId === stage.id),
  })),
)

async function createTournament() {
  await run(async () => {
    const t = await api.createTournament(newTournamentName.value.trim())
    newTournamentName.value = ''
    await loadTournaments()
    await select(t.id)
  })
}

async function addParticipant() {
  if (!selectedId.value) return
  await run(async () => {
    const seed = newParticipant.seed ? Number(newParticipant.seed) : null
    await api.addParticipant(selectedId.value!, { name: newParticipant.name.trim(), seed })
    newParticipant.name = ''
    newParticipant.seed = ''
  })
}

async function removeParticipant(id: string) {
  await run(async () => {
    await api.deleteParticipant(id)
    await feed.refresh()
  })
}

async function createStage() {
  if (!selectedId.value) return
  await run(async () => {
    await api.createStage(selectedId.value!, {
      name: newStage.name.trim(),
      type: newStage.type,
      format: newStage.type === 'group' ? 'round_robin' : 'single_elimination',
      bestOf: Number(newStage.bestOf),
      startScore: newStage.startScore,
      outMode: newStage.outMode,
    })
    newStage.name = ''
    await feed.refresh()
  })
}

async function generate(stageId: string, type: StageType) {
  await run(async () => {
    await api.generateStage(
      stageId,
      type === 'group'
        ? { groupCount: Number(genOpts.groupCount) }
        : { qualifiersPerGroup: Number(genOpts.qualifiersPerGroup) },
    )
    await feed.refresh()
  })
}

onUnmounted(() => feed.close())
</script>

<template>
  <div class="stack">
    <p v-if="error" class="error">{{ error }}</p>

    <section class="panel stack">
      <h2>Tournaments</h2>
      <div class="row">
        <input v-model="newTournamentName" placeholder="New tournament name" />
        <button class="primary" :disabled="!newTournamentName.trim()" @click="createTournament">
          Create
        </button>
      </div>
      <div class="row">
        <button
          v-for="t in tournaments"
          :key="t.id"
          :class="{ primary: t.id === selectedId }"
          @click="select(t.id)"
        >
          {{ t.name }}
        </button>
      </div>
    </section>

    <template v-if="detail">
      <section class="panel stack">
        <div class="row" style="justify-content: space-between">
          <h2>{{ detail.tournament.name }} · {{ detail.tournament.status }}</h2>
          <RouterLink :to="`/view/${detail.tournament.id}`" target="_blank">
            Open overview ↗
          </RouterLink>
        </div>

        <h3>Players ({{ detail.participants.length }})</h3>
        <ul class="players">
          <li v-for="p in detail.participants" :key="p.id" class="row">
            <span>{{ p.name }}</span>
            <span class="muted" v-if="p.seed">seed {{ p.seed }}</span>
            <button @click="removeParticipant(p.id)">✕</button>
          </li>
        </ul>
        <div class="row">
          <input
            v-model="newParticipant.name"
            placeholder="Player name"
            @keyup.enter="addParticipant"
          />
          <input v-model="newParticipant.seed" placeholder="Seed" style="width: 6rem" />
          <button :disabled="!newParticipant.name.trim()" @click="addParticipant">Add</button>
        </div>
      </section>

      <section class="panel stack">
        <h3>Add stage</h3>
        <div class="row">
          <input v-model="newStage.name" placeholder="Stage name (e.g. Groups)" />
          <select v-model="newStage.type">
            <option value="group">Group (round-robin)</option>
            <option value="knockout">Knockout (single elim.)</option>
          </select>
          <label class="row">Best of <input v-model="newStage.bestOf" style="width: 4rem" /></label>
          <select v-model="newStage.startScore">
            <option :value="301">301</option>
            <option :value="501">501</option>
          </select>
          <select v-model="newStage.outMode">
            <option value="single">Single out</option>
            <option value="double">Double out</option>
          </select>
          <button :disabled="!newStage.name.trim()" @click="createStage">Add stage</button>
        </div>
        <div class="row muted">
          <label class="row"
            >Groups <input v-model="genOpts.groupCount" style="width: 4rem"
          /></label>
          <label class="row">
            Qualifiers / group <input v-model="genOpts.qualifiersPerGroup" style="width: 4rem" />
          </label>
        </div>
      </section>

      <section v-for="{ stage, matches } in stagesWithMatches" :key="stage.id" class="panel stack">
        <div class="row" style="justify-content: space-between">
          <h3>{{ stage.name }} · {{ stage.type }} · Bo{{ stage.bestOf }}</h3>
          <button class="primary" @click="generate(stage.id, stage.type)">
            {{ matches.length ? 'Regenerate' : 'Generate' }}
          </button>
        </div>
        <table v-if="matches.length">
          <thead>
            <tr>
              <th>R</th>
              <th>Match</th>
              <th>Legs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in matches" :key="m.id">
              <td>{{ m.round + 1 }}</td>
              <td>
                <strong :class="{ win: m.winnerId === m.participantAId }">{{
                  nameOf(m.participantAId)
                }}</strong>
                vs
                <strong :class="{ win: m.winnerId === m.participantBId }">{{
                  nameOf(m.participantBId)
                }}</strong>
              </td>
              <td>{{ live.get(m.id)?.legsA ?? m.legsA }}–{{ live.get(m.id)?.legsB ?? m.legsB }}</td>
              <td>{{ m.status }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">No matches yet — set players/options and Generate.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.error {
  color: var(--bad);
  margin: 0;
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.players li {
  background: var(--panel-2);
  border-radius: 8px;
  padding: 0.25rem 0.5rem;
}

.win {
  color: var(--good);
}
</style>
