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
const newFloorName = ref('')
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
const floorNameOf = computed(() => {
  const map = new Map((detail.value?.floors ?? []).map((floor) => [floor.id, floor.name]))
  return (id: string | null) => (id ? (map.get(id) ?? '—') : 'Unassigned')
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

async function addFloor() {
  if (!selectedId.value) return
  await run(async () => {
    await api.createFloor(selectedId.value!, newFloorName.value.trim())
    newFloorName.value = ''
    await feed.refresh()
  })
}

async function removeFloor(id: string) {
  await run(async () => {
    await api.deleteFloor(id)
    await feed.refresh()
  })
}

async function assignFloor(matchId: string, event: Event) {
  const floorId = (event.target as HTMLSelectElement).value
  if (!floorId) return
  await run(async () => {
    await api.assignMatchFloor(matchId, floorId)
    await feed.refresh()
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
  <div class="admin">
    <p v-if="error" class="error">{{ error }}</p>

    <div class="admin-shell">
      <aside class="tournament-rail pd-panel">
        <div class="rail-heading">
          <p class="eyebrow">Tournament desk</p>
          <h1>Tournaments</h1>
        </div>
        <div class="create-tournament">
          <input
            v-model="newTournamentName"
            aria-label="New tournament name"
            placeholder="New tournament name"
            @keyup.enter="createTournament"
          />
          <button
            class="pd-button--primary"
            :disabled="!newTournamentName.trim()"
            @click="createTournament"
          >
            Create
          </button>
        </div>
        <div class="tournament-list" aria-label="Tournament selector">
          <button
            v-for="t in tournaments"
            :key="t.id"
            :class="{ 'tournament-button--active': t.id === selectedId }"
            @click="select(t.id)"
          >
            {{ t.name }}
          </button>
          <p v-if="!tournaments.length" class="pd-muted rail-empty">
            Create a tournament to begin.
          </p>
        </div>
      </aside>

      <section v-if="detail" class="admin-workbench">
        <header class="workbench-heading">
          <div>
            <p class="eyebrow">Tournament workbench</p>
            <div class="title-row">
              <h2>{{ detail.tournament.name }}</h2>
              <span class="status">{{ detail.tournament.status }}</span>
            </div>
          </div>
          <RouterLink :to="`/view/${detail.tournament.id}`" target="_blank">
            Open overview ↗
          </RouterLink>
        </header>

        <div class="setup-grid">
          <section class="pd-panel pd-panel--compact setup-panel">
            <div>
              <p class="eyebrow">Configuration</p>
              <h3>Add stage</h3>
            </div>
            <div class="stage-form">
              <input v-model="newStage.name" placeholder="Stage name (e.g. Groups)" />
              <select v-model="newStage.type" aria-label="Stage type">
                <option value="group">Group (round-robin)</option>
                <option value="knockout">Knockout (single elim.)</option>
              </select>
              <label>
                <span>Best of</span>
                <input v-model="newStage.bestOf" aria-label="Best of" />
              </label>
              <select v-model="newStage.startScore" aria-label="Starting score">
                <option :value="301">301</option>
                <option :value="501">501</option>
              </select>
              <select v-model="newStage.outMode" aria-label="Checkout mode">
                <option value="single">Single out</option>
                <option value="double">Double out</option>
              </select>
              <button :disabled="!newStage.name.trim()" @click="createStage">Add stage</button>
            </div>
            <div class="generation-options pd-muted">
              <label
                >Groups <input v-model="genOpts.groupCount" aria-label="Number of groups"
              /></label>
              <label>
                Qualifiers / group
                <input v-model="genOpts.qualifiersPerGroup" aria-label="Qualifiers per group" />
              </label>
            </div>
          </section>

          <section class="pd-panel pd-panel--compact setup-panel">
            <div>
              <p class="eyebrow">Boards</p>
              <h3>Floors</h3>
            </div>
            <p class="pd-muted">Each floor accepts one connected board.</p>
            <div v-if="detail.floors.length" class="floor-list">
              <span v-for="floor in detail.floors" :key="floor.id" class="floor-chip">
                {{ floor.name }}
                <button
                  class="remove-button"
                  aria-label="Remove floor"
                  @click="removeFloor(floor.id)"
                >
                  ✕
                </button>
              </span>
            </div>
            <div class="inline-create">
              <input v-model="newFloorName" placeholder="Floor name" @keyup.enter="addFloor" />
              <button :disabled="!newFloorName.trim()" @click="addFloor">Add</button>
            </div>
          </section>

          <section class="pd-panel pd-panel--compact setup-panel">
            <div class="section-title">
              <div>
                <p class="eyebrow">Roster</p>
                <h3>
                  Players <span class="count">{{ detail.participants.length }}</span>
                </h3>
              </div>
            </div>
            <ul v-if="detail.participants.length" class="players">
              <li v-for="p in detail.participants" :key="p.id">
                <span>{{ p.name }}</span>
                <span v-if="p.seed" class="pd-muted">seed {{ p.seed }}</span>
                <button
                  class="remove-button"
                  aria-label="Remove player"
                  @click="removeParticipant(p.id)"
                >
                  ✕
                </button>
              </li>
            </ul>
            <div class="player-create">
              <input
                v-model="newParticipant.name"
                placeholder="Player name"
                @keyup.enter="addParticipant"
              />
              <input v-model="newParticipant.seed" aria-label="Seed" placeholder="Seed" />
              <button :disabled="!newParticipant.name.trim()" @click="addParticipant">Add</button>
            </div>
          </section>
        </div>

        <section class="stages-section">
          <div class="stages-heading">
            <div>
              <p class="eyebrow">Schedule</p>
              <h2>Stages & matches</h2>
            </div>
            <p class="pd-muted">Generate a stage when the roster and format are ready.</p>
          </div>

          <div v-if="stagesWithMatches.length" class="stage-grid">
            <section
              v-for="{ stage, matches } in stagesWithMatches"
              :key="stage.id"
              class="pd-panel pd-panel--compact stage-panel"
            >
              <div class="stage-heading">
                <div>
                  <h3>{{ stage.name }}</h3>
                  <p class="pd-muted">{{ stage.type }} · Bo{{ stage.bestOf }}</p>
                </div>
                <button class="pd-button--primary" @click="generate(stage.id, stage.type)">
                  {{ matches.length ? 'Regenerate' : 'Generate' }}
                </button>
              </div>
              <div v-if="matches.length" class="match-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>R</th>
                      <th>Match</th>
                      <th>Legs</th>
                      <th>Floor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in matches" :key="m.id">
                      <td>{{ m.round + 1 }}</td>
                      <td class="match-players">
                        <strong :class="{ win: m.winnerId === m.participantAId }">{{
                          nameOf(m.participantAId)
                        }}</strong>
                        <span class="pd-muted">vs</span>
                        <strong :class="{ win: m.winnerId === m.participantBId }">{{
                          nameOf(m.participantBId)
                        }}</strong>
                      </td>
                      <td class="pd-numeric">
                        {{ live.get(m.id)?.legsA ?? m.legsA }}–{{
                          live.get(m.id)?.legsB ?? m.legsB
                        }}
                      </td>
                      <td>
                        <select
                          v-if="m.status === 'ready'"
                          :value="m.floorId ?? ''"
                          :disabled="!detail.floors.length"
                          @change="assignFloor(m.id, $event)"
                        >
                          <option value="">Assign floor</option>
                          <option v-for="floor in detail.floors" :key="floor.id" :value="floor.id">
                            {{ floor.name }}
                          </option>
                        </select>
                        <span v-else>{{ floorNameOf(m.floorId) }}</span>
                      </td>
                      <td>
                        <span class="match-status">{{ m.status }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="pd-muted">No matches yet — set players/options and Generate.</p>
            </section>
          </div>
          <div v-else class="pd-panel pd-panel--compact empty-stages">
            <p class="pd-muted">Add a stage to begin building the tournament schedule.</p>
          </div>
        </section>
      </section>

      <section v-else class="empty-workbench pd-panel">
        <p class="eyebrow">Tournament workbench</p>
        <h2>Select a tournament</h2>
        <p class="pd-muted">
          Choose a tournament from the rail or create a new one to configure it.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin {
  display: grid;
  gap: var(--pd-space-4);
}

.error {
  margin: 0;
  padding: var(--pd-space-3) var(--pd-space-4);
  border: 1px solid var(--pd-danger);
  border-radius: var(--pd-radius);
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}

.admin-shell {
  display: grid;
  gap: var(--pd-space-5);
  align-items: start;
}

.tournament-rail {
  gap: var(--pd-space-4);
}

.rail-heading,
.workbench-heading > div,
.stages-heading > div,
.setup-panel > div {
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

.create-tournament,
.inline-create,
.player-create {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--pd-space-2);
}

.tournament-list {
  display: grid;
  gap: var(--pd-space-2);
}

.tournament-list button {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

.tournament-button--active {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
}

.rail-empty {
  margin: var(--pd-space-2) 0;
}

.admin-workbench {
  display: grid;
  min-width: 0;
  gap: var(--pd-space-5);
}

.workbench-heading,
.stages-heading,
.stage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-4);
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pd-space-2);
}

.status,
.match-status {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: var(--pd-space-1) var(--pd-space-2);
  border: 1px solid var(--pd-border-strong);
  border-radius: var(--pd-radius-sm);
  color: var(--pd-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.setup-grid {
  display: grid;
  gap: var(--pd-space-4);
  align-items: stretch;
}

.setup-panel {
  min-width: 0;
}

.stage-form {
  display: grid;
  grid-template-columns: minmax(10rem, 1.7fr) minmax(9rem, 1.4fr) minmax(5rem, 0.7fr);
  gap: var(--pd-space-2);
}

.stage-form select,
.stage-form button {
  min-width: 0;
}

.stage-form label,
.generation-options label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--pd-space-2);
  color: var(--pd-text-muted);
}

.stage-form label input,
.generation-options input {
  width: 100%;
  min-width: 0;
}

.generation-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pd-space-3);
}

.generation-options label {
  flex: 1 1 10rem;
}

.floor-list,
.players {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pd-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.floor-chip,
.players li {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: var(--pd-space-2);
  padding: var(--pd-space-1) var(--pd-space-2);
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-surface-sunken);
}

.players li span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  color: var(--pd-text-muted);
  font-size: 0.88em;
}

.player-create {
  grid-template-columns: minmax(0, 1fr) 5.5rem auto;
}

.remove-button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: var(--pd-space-1);
  border: 0;
  background: transparent;
  color: var(--pd-text-muted);
  font-size: 1rem;
}

.remove-button:hover:not(:disabled) {
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}

.stages-section {
  display: grid;
  gap: var(--pd-space-4);
}

.stages-heading {
  align-items: end;
}

.stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr));
  gap: var(--pd-space-4);
  align-items: start;
}

.stage-panel {
  min-width: 0;
}

.stage-heading {
  align-items: start;
}

.match-table-wrap {
  overflow-x: auto;
}

.match-table-wrap table {
  min-width: 35rem;
}

.match-players {
  min-width: 13rem;
}

.match-players strong + span {
  margin-inline: var(--pd-space-1);
}

.win {
  color: var(--pd-success);
}

.empty-stages,
.empty-workbench {
  min-height: 12rem;
  justify-content: center;
}

.empty-workbench {
  gap: var(--pd-space-2);
}

@media (min-width: 75rem) {
  .admin-shell {
    grid-template-columns: minmax(15rem, 18rem) minmax(0, 1fr);
  }

  .tournament-rail {
    position: sticky;
    top: calc(4.5rem + var(--pd-space-4));
    max-height: calc(100vh - 6.5rem);
    overflow-y: auto;
  }

  .setup-grid {
    grid-template-columns: minmax(0, 1.3fr) minmax(15rem, 0.9fr) minmax(17rem, 1fr);
  }
}

@media (max-width: 74.99rem) {
  .tournament-list {
    display: flex;
    overflow-x: auto;
    padding-bottom: var(--pd-space-1);
  }

  .tournament-list button {
    width: auto;
    flex: 0 0 auto;
  }

  .setup-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .setup-grid > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 40rem) {
  .workbench-heading,
  .stages-heading,
  .stage-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .setup-grid,
  .stage-form {
    grid-template-columns: 1fr;
  }

  .player-create {
    grid-template-columns: minmax(0, 1fr) 5rem;
  }

  .player-create input:first-child {
    grid-column: 1 / -1;
  }

  .generation-options {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
