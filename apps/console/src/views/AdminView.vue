<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import type { OutMode, StageType, StartScore, Tournament, TournamentStatus } from '@pi-darts/shared'
import { api } from '../api'
import { useTournamentFeed } from '../feed'

type AdminTab = 'setup' | 'tournament'

const tournaments = ref<Tournament[]>([])
const feed = useTournamentFeed()
const { detail, live } = feed
const selectedId = ref<string | null>(null)
const activeTab = ref<AdminTab>('setup')
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

function defaultTab(status: TournamentStatus): AdminTab {
  return status === 'setup' ? 'setup' : 'tournament'
}

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
  if (detail.value) activeTab.value = defaultTab(detail.value.tournament.status)
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
  (detail.value?.stages ?? []).map((stage) => {
    const matches = (detail.value?.matches ?? []).filter((match) => match.stageId === stage.id)
    return {
      stage,
      matches,
      completed: matches.filter((match) => match.status === 'completed').length,
      ready: matches.filter((match) => match.status === 'ready').length,
      live: matches.filter((match) => match.status === 'live').length,
    }
  }),
)
const readyMatches = computed(() =>
  (detail.value?.matches ?? []).filter((match) => match.status === 'ready'),
)
const liveMatches = computed(() =>
  (detail.value?.matches ?? []).filter((match) => match.status === 'live'),
)
const queuedMatches = computed(() =>
  (detail.value?.matches ?? []).filter((match) => match.status === 'pending'),
)
const assignedMatches = computed(() => readyMatches.value.filter((match) => match.floorId !== null))
const completedMatches = computed(() =>
  (detail.value?.matches ?? []).filter((match) => match.status === 'completed'),
)

async function createTournament() {
  await run(async () => {
    const tournament = await api.createTournament(newTournamentName.value.trim())
    newTournamentName.value = ''
    await loadTournaments()
    await select(tournament.id)
  })
}

async function addParticipant() {
  const tournamentId = selectedId.value
  if (!tournamentId) return
  await run(async () => {
    const seed = newParticipant.seed ? Number(newParticipant.seed) : null
    await api.addParticipant(tournamentId, { name: newParticipant.name.trim(), seed })
    newParticipant.name = ''
    newParticipant.seed = ''
  })
}

async function addFloor() {
  const tournamentId = selectedId.value
  if (!tournamentId) return
  await run(async () => {
    await api.createFloor(tournamentId, newFloorName.value.trim())
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
  const tournamentId = selectedId.value
  if (!tournamentId) return
  await run(async () => {
    await api.createStage(tournamentId, {
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
    const currentTournament = detail.value?.tournament
    if (currentTournament?.status === 'active') {
      tournaments.value = tournaments.value.map((tournament) =>
        tournament.id === currentTournament.id
          ? { ...tournament, status: currentTournament.status }
          : tournament,
      )
      activeTab.value = 'tournament'
    }
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
            v-for="tournament in tournaments"
            :key="tournament.id"
            :class="{ 'tournament-button--active': tournament.id === selectedId }"
            @click="select(tournament.id)"
          >
            <span>{{ tournament.name }}</span>
            <small>{{ tournament.status }}</small>
          </button>
          <p v-if="!tournaments.length" class="pd-muted rail-empty">
            Create a tournament to begin.
          </p>
        </div>
      </aside>

      <section v-if="detail" class="admin-workbench">
        <header class="workbench-heading">
          <div>
            <p class="eyebrow">
              {{ activeTab === 'setup' ? 'Tournament preparation' : 'Tournament operations' }}
            </p>
            <div class="title-row">
              <h2>{{ detail.tournament.name }}</h2>
              <span class="status">{{ detail.tournament.status }}</span>
            </div>
          </div>
          <div class="heading-actions">
            <RouterLink :to="`/view/${detail.tournament.id}`" target="_blank">
              Open overview ↗
            </RouterLink>
          </div>
        </header>

        <div class="admin-tabs" role="tablist" aria-label="Tournament workspace">
          <button
            :class="{ 'admin-tab--active': activeTab === 'setup' }"
            role="tab"
            :aria-selected="activeTab === 'setup'"
            @click="activeTab = 'setup'"
          >
            Setup
          </button>
          <button
            :class="{ 'admin-tab--active': activeTab === 'tournament' }"
            role="tab"
            :aria-selected="activeTab === 'tournament'"
            @click="activeTab = 'tournament'"
          >
            Tournament
          </button>
        </div>

        <section v-if="activeTab === 'setup'" class="setup-workflow">
          <header class="workflow-heading">
            <div>
              <p class="eyebrow">Guided preparation</p>
              <h2>Build the playing order</h2>
            </div>
            <p class="pd-muted">Add the roster, prepare boards, then create and generate stages.</p>
          </header>

          <section class="pd-panel setup-step">
            <div class="step-heading">
              <span class="step-number">1</span>
              <div>
                <p class="eyebrow">Roster</p>
                <h3>
                  Players <span class="count">{{ detail.participants.length }}</span>
                </h3>
              </div>
            </div>
            <ul v-if="detail.participants.length" class="players">
              <li v-for="participant in detail.participants" :key="participant.id">
                <span>{{ participant.name }}</span>
                <span v-if="participant.seed" class="pd-muted">seed {{ participant.seed }}</span>
                <button
                  class="remove-button"
                  aria-label="Remove player"
                  @click="removeParticipant(participant.id)"
                >
                  ✕
                </button>
              </li>
            </ul>
            <p v-else class="pd-muted">Add every player before generating the first stage.</p>
            <div class="player-create">
              <input
                v-model="newParticipant.name"
                placeholder="Player name"
                @keyup.enter="addParticipant"
              />
              <input v-model="newParticipant.seed" aria-label="Seed" placeholder="Seed" />
              <button :disabled="!newParticipant.name.trim()" @click="addParticipant">
                Add player
              </button>
            </div>
          </section>

          <section class="pd-panel setup-step">
            <div class="step-heading">
              <span class="step-number">2</span>
              <div>
                <p class="eyebrow">Boards</p>
                <h3>
                  Floors <span class="count">{{ detail.floors.length }}</span>
                </h3>
              </div>
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
              <button :disabled="!newFloorName.trim()" @click="addFloor">Add floor</button>
            </div>
          </section>

          <section class="pd-panel setup-step">
            <div class="step-heading">
              <span class="step-number">3</span>
              <div>
                <p class="eyebrow">Format</p>
                <h3>Create a stage</h3>
              </div>
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
          </section>

          <section class="schedule-step">
            <div class="workflow-heading">
              <div>
                <p class="eyebrow">Schedule</p>
                <h2>Generate stages</h2>
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
            </div>
            <div v-if="stagesWithMatches.length" class="setup-stage-list">
              <article
                v-for="{ stage, matches } in stagesWithMatches"
                :key="stage.id"
                class="pd-panel pd-panel--compact setup-stage-card"
              >
                <div>
                  <h3>{{ stage.name }}</h3>
                  <p class="pd-muted">
                    {{ stage.type }} · Bo{{ stage.bestOf }} · {{ stage.startScore }} ·
                    {{ stage.outMode }} out
                  </p>
                </div>
                <button
                  class="pd-button--primary"
                  :disabled="matches.length > 0"
                  @click="generate(stage.id, stage.type)"
                >
                  {{ matches.length ? `${matches.length} matches generated` : 'Generate stage' }}
                </button>
              </article>
            </div>
            <div v-else class="pd-panel pd-panel--compact empty-stages">
              <p class="pd-muted">Add a stage to begin building the tournament schedule.</p>
            </div>
          </section>
        </section>

        <section v-else class="tournament-workspace">
          <section
            v-if="detail.tournament.status === 'completed'"
            class="completed-summary pd-panel"
          >
            <div>
              <p class="eyebrow">Tournament complete</p>
              <h2>All scheduled matches are complete.</h2>
            </div>
            <strong>{{ completedMatches.length }} matches played</strong>
          </section>

          <section class="operations-surface">
            <div class="operations-heading">
              <div>
                <p class="eyebrow">Floor control</p>
                <h2>Ready to play</h2>
              </div>
              <span class="ready-count">{{ readyMatches.length }} ready</span>
            </div>
            <div v-if="readyMatches.length" class="ready-match-grid">
              <article v-for="match in readyMatches" :key="match.id" class="pd-panel ready-match">
                <div class="ready-match-meta">
                  <span>{{
                    stagesWithMatches.find((item) => item.stage.id === match.stageId)?.stage.name
                  }}</span>
                  <span>Round {{ match.round + 1 }}</span>
                </div>
                <div class="ready-matchup">
                  <strong>{{ nameOf(match.participantAId) }}</strong>
                  <span>vs</span>
                  <strong>{{ nameOf(match.participantBId) }}</strong>
                </div>
                <p class="pd-muted">
                  {{ match.startScore }} · {{ match.outMode }} out · best of {{ match.bestOf }}
                </p>
                <label class="floor-select">
                  <span>Play on</span>
                  <select
                    :value="match.floorId ?? ''"
                    :disabled="!detail.floors.length"
                    @change="assignFloor(match.id, $event)"
                  >
                    <option value="">Select floor</option>
                    <option v-for="floor in detail.floors" :key="floor.id" :value="floor.id">
                      {{ floor.name }}
                    </option>
                  </select>
                </label>
              </article>
            </div>
            <div v-else class="pd-panel pd-panel--compact operations-empty">
              <p class="pd-muted">
                {{
                  detail.tournament.status === 'completed'
                    ? 'No matches remain.'
                    : 'No match is ready yet. Watch stage progress below for the next release.'
                }}
              </p>
            </div>
          </section>

          <section class="secondary-status">
            <article class="pd-panel pd-panel--compact status-panel">
              <div class="status-panel-heading">
                <div>
                  <p class="eyebrow">Live boards</p>
                  <h3>{{ liveMatches.length ? `${liveMatches.length} in play` : 'Waiting' }}</h3>
                </div>
              </div>
              <div v-if="liveMatches.length" class="live-match-list">
                <div v-for="match in liveMatches" :key="match.id" class="live-match-row">
                  <span
                    >{{ nameOf(match.participantAId) }} vs {{ nameOf(match.participantBId) }}</span
                  >
                  <strong
                    >{{ live.get(match.id)?.legsA ?? match.legsA }}–{{
                      live.get(match.id)?.legsB ?? match.legsB
                    }}</strong
                  >
                  <small>{{ floorNameOf(match.floorId) }}</small>
                </div>
              </div>
              <p v-else class="pd-muted">No board is scoring a match right now.</p>
            </article>

            <article class="pd-panel pd-panel--compact status-panel">
              <p class="eyebrow">Match queue</p>
              <div class="queue-counts">
                <div>
                  <strong>{{ assignedMatches.length }}</strong>
                  <span>assigned</span>
                </div>
                <div>
                  <strong>{{ queuedMatches.length }}</strong>
                  <span>queued</span>
                </div>
                <div>
                  <strong>{{ completedMatches.length }}</strong>
                  <span>complete</span>
                </div>
              </div>
              <p class="pd-muted">Assigned matches stay in Ready until their board claims them.</p>
            </article>
          </section>

          <section class="stage-progress">
            <div class="operations-heading">
              <div>
                <p class="eyebrow">Tournament progress</p>
                <h2>Stages</h2>
              </div>
              <span class="pd-muted"
                >{{ completedMatches.length }} / {{ detail.matches.length }} complete</span
              >
            </div>
            <div v-if="stagesWithMatches.length" class="stage-progress-list">
              <article
                v-for="{ stage, matches, completed, ready, live: liveCount } in stagesWithMatches"
                :key="stage.id"
                class="pd-panel pd-panel--compact progress-card"
              >
                <div class="progress-card-heading">
                  <div>
                    <h3>{{ stage.name }}</h3>
                    <p class="pd-muted">{{ stage.type }} · Bo{{ stage.bestOf }}</p>
                  </div>
                  <span>{{ completed }}/{{ matches.length || '—' }}</span>
                </div>
                <div v-if="matches.length" class="progress-track" aria-hidden="true">
                  <span :style="{ width: `${(completed / matches.length) * 100}%` }"></span>
                </div>
                <p class="pd-muted">
                  {{
                    matches.length
                      ? `${ready} ready · ${liveCount} live · ${completed} complete`
                      : 'Waiting to be generated'
                  }}
                </p>
                <button
                  v-if="!matches.length && detail.tournament.status !== 'completed'"
                  @click="generate(stage.id, stage.type)"
                >
                  Generate {{ stage.name }}
                </button>
              </article>
            </div>
            <div v-else class="pd-panel pd-panel--compact empty-stages">
              <p class="pd-muted">
                No stages have been created. Switch to Setup to prepare the draw.
              </p>
            </div>
          </section>
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
.admin,
.admin-workbench,
.setup-workflow,
.tournament-workspace,
.schedule-step,
.operations-surface,
.stage-progress {
  display: grid;
  gap: var(--pd-space-5);
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
.workflow-heading > div,
.step-heading > div,
.operations-heading > div,
.status-panel-heading > div,
.progress-card-heading > div {
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
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-2);
  text-align: left;
}

.tournament-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tournament-list small {
  color: var(--pd-text-dim);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
  min-width: 0;
}

.workbench-heading,
.workflow-heading,
.operations-heading,
.progress-card-heading,
.completed-summary,
.stage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-4);
}

.heading-actions {
  display: flex;
  flex: 0 0 auto;
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pd-space-2);
}

.status,
.ready-count {
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

.admin-tabs {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  padding: var(--pd-space-1);
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius);
  background: var(--pd-surface-sunken);
}

.admin-tabs button {
  min-width: 8rem;
  border-color: transparent;
  background: transparent;
  color: var(--pd-text-muted);
}

.admin-tabs .admin-tab--active {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
}

.workflow-heading {
  align-items: end;
}

.workflow-heading > .pd-muted {
  max-width: 30rem;
  margin: 0;
  text-align: right;
}

.setup-step {
  display: grid;
  gap: var(--pd-space-3);
}

.step-heading {
  display: flex;
  align-items: center;
  gap: var(--pd-space-3);
}

.step-number {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--pd-border-accent);
  border-radius: var(--pd-radius-lg);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
  font-weight: 850;
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
  width: 2.75rem;
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
.generation-options label,
.floor-select {
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
  justify-content: flex-end;
  gap: var(--pd-space-3);
}

.generation-options label {
  flex: 1 1 10rem;
}

.setup-stage-list,
.stage-progress-list {
  display: grid;
  gap: var(--pd-space-3);
}

.setup-stage-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-4);
}

.setup-stage-card > div {
  display: grid;
  gap: var(--pd-space-1);
}

.setup-stage-card p,
.completed-summary p,
.progress-card p,
.status-panel p {
  margin: 0;
}

.empty-stages,
.empty-workbench,
.operations-empty {
  min-height: 8rem;
  justify-content: center;
}

.tournament-workspace {
  gap: var(--pd-space-6);
}

.completed-summary {
  border-color: var(--pd-success);
  background: var(--pd-success-soft);
}

.completed-summary strong {
  color: var(--pd-success);
  font-variant-numeric: tabular-nums;
}

.operations-surface {
  width: min(100%, 90rem);
  margin: 0 auto;
}

.ready-count {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
}

.ready-match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: var(--pd-space-4);
}

.ready-match {
  display: grid;
  min-height: 17rem;
  align-content: space-between;
  gap: var(--pd-space-3);
  border-color: var(--pd-border-accent);
  background: var(--pd-surface-gradient);
}

.ready-match-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--pd-space-2);
  color: var(--pd-text-muted);
  font-size: 0.76rem;
  font-weight: 750;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.ready-matchup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--pd-space-2);
}

.ready-matchup strong {
  overflow: hidden;
  font-size: clamp(1.25rem, 2vw, 1.8rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ready-matchup strong:last-child {
  text-align: right;
}

.ready-matchup span {
  color: var(--pd-accent);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.floor-select {
  justify-content: space-between;
  padding-top: var(--pd-space-2);
  border-top: 1px solid var(--pd-border);
  font-weight: 750;
}

.floor-select select {
  min-width: 9rem;
}

.secondary-status {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--pd-space-4);
}

.status-panel {
  min-width: 0;
  gap: var(--pd-space-3);
}

.live-match-list {
  display: grid;
}

.live-match-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--pd-space-3);
  padding: var(--pd-space-2) 0;
  border-top: 1px solid var(--pd-border);
}

.live-match-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-match-row strong {
  color: var(--pd-accent);
  font-variant-numeric: tabular-nums;
}

.live-match-row small {
  color: var(--pd-text-muted);
}

.queue-counts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--pd-space-2);
}

.queue-counts div {
  display: grid;
  gap: var(--pd-space-1);
  padding: var(--pd-space-2);
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-surface-sunken);
}

.queue-counts strong {
  color: var(--pd-accent);
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
}

.queue-counts span {
  color: var(--pd-text-muted);
  font-size: 0.7rem;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stage-progress {
  width: min(100%, 90rem);
  margin: 0 auto;
}

.stage-progress-list {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}

.progress-card {
  min-width: 0;
  gap: var(--pd-space-3);
}

.progress-card-heading {
  align-items: start;
}

.progress-card-heading > span {
  color: var(--pd-accent);
  font-size: 0.84rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.progress-track {
  height: 0.5rem;
  overflow: hidden;
  border-radius: var(--pd-radius-lg);
  background: var(--pd-surface-sunken);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--pd-accent);
}

.empty-workbench {
  gap: var(--pd-space-2);
}

@media (min-width: 75rem) {
  .admin-shell {
    grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr);
  }

  .tournament-rail {
    position: sticky;
    top: calc(4.5rem + var(--pd-space-4));
    max-height: calc(100vh - 6.5rem);
    overflow-y: auto;
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
}

@media (max-width: 40rem) {
  .workbench-heading,
  .workflow-heading,
  .operations-heading,
  .completed-summary,
  .setup-stage-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .workflow-heading > .pd-muted {
    text-align: left;
  }

  .stage-form,
  .secondary-status {
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
    width: 100%;
    grid-template-columns: 1fr;
  }

  .admin-tabs {
    width: 100%;
  }

  .admin-tabs button {
    flex: 1;
    min-width: 0;
  }

  .ready-match {
    min-height: 15rem;
  }

  .live-match-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .live-match-row small {
    grid-column: 1 / -1;
  }
}
</style>
