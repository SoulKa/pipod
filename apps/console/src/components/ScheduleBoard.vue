<script setup lang="ts">
// Split-view schedule board: an unassigned backlog plus one column per floor, each a
// vertical list of its matches tagged by state. Scheduled (ready) matches drag between
// floors and reorder within a floor; the live match is pinned and locked. An auto-assign
// button and an auto-fill toggle drive the server-side scheduler.
import { ref, watch } from 'vue'
import type { SortableEvent } from 'sortablejs'
import { VueDraggable } from 'vue-draggable-plus'
import type { Floor, LiveMatchState, Match } from '@pi-darts/shared'
import { api, type TournamentDetail } from '../api'

const props = defineProps<{ detail: TournamentDetail; live: Map<string, LiveMatchState> }>()
const emit = defineEmits<{ refresh: []; error: [message: string] }>()

const BACKLOG = 'backlog'

// Local, mutable copies bound to the draggable lists; re-synced whenever the feed updates.
const backlog = ref<Match[]>([])
const columns = ref<{ floor: Floor; queue: Match[] }[]>([])
const busy = ref(false)

function orderMatches(list: Match[]): Match[] {
  return [...list].sort(
    (a, b) => a.queueOrder - b.queueOrder || a.round - b.round || a.slot - b.slot,
  )
}

function syncFromProps(): void {
  const matches = props.detail.matches
  backlog.value = orderMatches(matches.filter((m) => m.status === 'ready' && m.floorId === null))
  columns.value = props.detail.floors.map((floor) => ({
    floor,
    queue: orderMatches(matches.filter((m) => m.floorId === floor.id && m.status === 'ready')),
  }))
}
watch(() => props.detail, syncFromProps, { deep: true, immediate: true })

const nameOf = (id: string | null): string => {
  if (!id) return '—'
  return props.detail.participants.find((p) => p.id === id)?.name ?? '—'
}
const stageName = (stageId: string): string =>
  props.detail.stages.find((s) => s.id === stageId)?.name ?? ''
const liveOnFloor = (floorId: string): Match | undefined =>
  props.detail.matches.find((m) => m.floorId === floorId && m.status === 'live')
const pendingCount = (): number =>
  props.detail.matches.filter((m) => m.status === 'pending').length

async function apply(fn: () => Promise<unknown>): Promise<void> {
  busy.value = true
  try {
    await fn()
  } catch (e) {
    emit('error', (e as Error).message)
  } finally {
    busy.value = false
    // Reconcile local lists with the authoritative server state.
    emit('refresh')
  }
}

/** SortableJS end: translate the drop into an assign / reorder / unassign call. */
function onDragEnd(evt: SortableEvent): void {
  const matchId = (evt.item as HTMLElement)?.dataset.id
  const to = (evt.to as HTMLElement)?.dataset.floor
  if (!matchId || !to) return
  const sameList = evt.from === evt.to

  if (to === BACKLOG) {
    if (!sameList) void apply(() => api.assignMatchFloor(matchId, null))
    return // reordering the backlog carries no meaning
  }
  if (sameList) {
    const queue = columns.value.find((c) => c.floor.id === to)?.queue ?? []
    void apply(() => api.reorderFloorQueue(to, queue.map((m) => m.id)))
  } else {
    void apply(() => api.assignMatchFloor(matchId, to, evt.newIndex))
  }
}

const dragOptions = {
  animation: 150,
  group: 'matches',
  // Touch: require a short press so list scrolling still works on a tablet.
  delay: 120,
  delayOnTouchOnly: true,
  touchStartThreshold: 6,
  ghostClass: 'card-ghost',
}

async function runAutoAssign(): Promise<void> {
  await apply(() => api.autoAssign(props.detail.tournament.id))
}
async function toggleAutoFill(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  await apply(() => api.setAutoFill(props.detail.tournament.id, enabled))
}
</script>

<template>
  <section class="schedule">
    <header class="schedule-head">
      <div>
        <p class="eyebrow">Feldsteuerung</p>
        <h2>Spielplan</h2>
      </div>
      <div class="schedule-controls">
        <label class="autofill-toggle">
          <input
            type="checkbox"
            :checked="detail.tournament.autoAssign"
            :disabled="busy || !detail.floors.length"
            @change="toggleAutoFill"
          />
          <span>Automatisch nachfüllen</span>
        </label>
        <button
          class="pd-button--primary"
          :disabled="busy || !detail.floors.length"
          @click="runAutoAssign"
        >
          Automatisch zuweisen
        </button>
      </div>
    </header>

    <p v-if="!detail.floors.length" class="pd-panel pd-panel--compact pd-muted no-floors">
      Lege zuerst ein Feld an, um Matches zuweisen zu können.
    </p>

    <div v-else class="schedule-board">
      <!-- Unassigned backlog -->
      <section class="floor-col pd-panel">
        <div class="floor-col-head">
          <h3>Nicht zugewiesen</h3>
          <span class="col-count">{{ backlog.length }}</span>
        </div>
        <VueDraggable
          v-model="backlog"
          class="drop-list"
          :data-floor="BACKLOG"
          v-bind="dragOptions"
          @end="onDragEnd"
        >
          <article v-for="match in backlog" :key="match.id" :data-id="match.id" class="match-card">
            <div class="match-meta">
              <span>{{ stageName(match.stageId) }}</span>
              <span>Runde {{ match.round + 1 }}</span>
            </div>
            <div class="matchup">
              <strong>{{ nameOf(match.participantAId) }}</strong>
              <span>vs</span>
              <strong>{{ nameOf(match.participantBId) }}</strong>
            </div>
            <span class="tag tag-scheduled">Geplant</span>
          </article>
        </VueDraggable>
        <p v-if="!backlog.length" class="col-empty pd-muted">
          {{ pendingCount() ? `${pendingCount()} warten auf Teilnehmer` : 'Alles zugewiesen' }}
        </p>
      </section>

      <!-- One column per floor -->
      <section v-for="column in columns" :key="column.floor.id" class="floor-col pd-panel">
        <div class="floor-col-head">
          <h3>{{ column.floor.name }}</h3>
          <span :class="['tag', liveOnFloor(column.floor.id) ? 'tag-live' : 'tag-idle']">
            {{ liveOnFloor(column.floor.id) ? 'Läuft' : 'Frei' }}
          </span>
        </div>

        <article v-if="liveOnFloor(column.floor.id)" class="match-card card-live">
          <div class="match-meta">
            <span>{{ stageName(liveOnFloor(column.floor.id)!.stageId) }}</span>
            <span class="tag tag-live">Läuft</span>
          </div>
          <div class="matchup">
            <strong>{{ nameOf(liveOnFloor(column.floor.id)!.participantAId) }}</strong>
            <span class="score">
              {{
                live.get(liveOnFloor(column.floor.id)!.id)?.legsA ?? liveOnFloor(column.floor.id)!.legsA
              }}–{{
                live.get(liveOnFloor(column.floor.id)!.id)?.legsB ?? liveOnFloor(column.floor.id)!.legsB
              }}
            </span>
            <strong>{{ nameOf(liveOnFloor(column.floor.id)!.participantBId) }}</strong>
          </div>
        </article>

        <VueDraggable
          v-model="column.queue"
          class="drop-list"
          :data-floor="column.floor.id"
          v-bind="dragOptions"
          @end="onDragEnd"
        >
          <article
            v-for="match in column.queue"
            :key="match.id"
            :data-id="match.id"
            class="match-card"
          >
            <div class="match-meta">
              <span>{{ stageName(match.stageId) }}</span>
              <span>Runde {{ match.round + 1 }}</span>
            </div>
            <div class="matchup">
              <strong>{{ nameOf(match.participantAId) }}</strong>
              <span>vs</span>
              <strong>{{ nameOf(match.participantBId) }}</strong>
            </div>
            <span class="tag tag-scheduled">Geplant</span>
          </article>
        </VueDraggable>
        <p
          v-if="!column.queue.length && !liveOnFloor(column.floor.id)"
          class="col-empty pd-muted"
        >
          Karten hierher ziehen
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  gap: var(--pd-space-3);
}
.schedule-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--pd-space-3);
  flex-wrap: wrap;
}
.schedule-head h2 {
  margin: 0;
}
.schedule-controls {
  display: flex;
  align-items: center;
  gap: var(--pd-space-3);
}
.autofill-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  cursor: pointer;
  color: var(--pd-muted, #94a3b8);
}
.autofill-toggle input {
  width: 20px;
  height: 20px;
  accent-color: var(--pd-accent);
}
.no-floors {
  padding: var(--pd-space-3);
}
.schedule-board {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(15rem, 1fr);
  gap: var(--pd-space-3);
  overflow-x: auto;
  padding-bottom: var(--pd-space-2);
  align-items: start;
}
.floor-col {
  display: flex;
  flex-direction: column;
  gap: var(--pd-space-2);
  padding: var(--pd-space-3);
  min-height: 8rem;
}
.floor-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pd-space-2);
}
.floor-col-head h3 {
  margin: 0;
  font-size: 1rem;
}
.col-count {
  font-variant-numeric: tabular-nums;
  color: var(--pd-muted, #94a3b8);
}
.drop-list {
  display: flex;
  flex-direction: column;
  gap: var(--pd-space-2);
  min-height: 3rem;
}
.col-empty {
  font-size: 0.85rem;
  padding: var(--pd-space-2);
  text-align: center;
  border: 1px dashed var(--pd-border, rgba(148, 163, 184, 0.25));
  border-radius: var(--pd-radius);
}
.match-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: var(--pd-space-2) var(--pd-space-3);
  min-height: 44px;
  background: var(--pd-surface-gradient, #17243a);
  border: 1px solid var(--pd-border, rgba(148, 163, 184, 0.25));
  border-radius: var(--pd-radius);
  cursor: grab;
}
.match-card:active {
  cursor: grabbing;
}
.card-live {
  cursor: default;
  border-color: var(--pd-border-accent, rgba(34, 211, 238, 0.65));
}
.card-ghost {
  opacity: 0.4;
}
.match-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--pd-space-2);
  font-size: 0.75rem;
  color: var(--pd-muted, #94a3b8);
}
.matchup {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.matchup strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Both names hug the central "vs": player A is right-aligned, player B left. */
.matchup strong:first-child {
  text-align: right;
}
.matchup strong:last-child {
  text-align: left;
}
.matchup span {
  font-size: 0.8rem;
  color: var(--pd-muted, #94a3b8);
}
.matchup .score {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--pd-accent);
}
.tag {
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}
.tag-scheduled {
  color: var(--pd-accent);
  background: var(--pd-accent-soft, rgba(34, 211, 238, 0.13));
}
.tag-live {
  color: var(--pd-success, #34d399);
  background: rgba(52, 211, 153, 0.15);
}
.tag-idle {
  color: var(--pd-muted, #94a3b8);
  background: rgba(148, 163, 184, 0.12);
}
</style>
