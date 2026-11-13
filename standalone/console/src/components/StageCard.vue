<script setup lang="ts">
import type { LiveMatchState, Match, Stage } from '@pipod/shared'
import { phaseLabel } from '../phases'
import BracketTree from './BracketTree.vue'
import PlayerTag from './PlayerTag.vue'

// One phase in the viewer: the bracket for a knockout, the match list for a group phase.
defineProps<{
  stage: Stage
  matches: Match[]
  live: Map<string, LiveMatchState>
  /** A knockout after a group phase is drawn from its table, which the empty text says. */
  afterGroups: boolean
}>()
</script>

<template>
  <section
    :class="
      stage.type === 'knockout' ? 'pd-panel stage-card stage-card--wide' : 'pd-panel stage-card'
    "
  >
    <div class="stage-card-heading">
      <div>
        <h3>{{ phaseLabel(stage.type) }}</h3>
        <p class="pd-muted">Bo{{ stage.bestOf }} · {{ stage.startScore }}</p>
      </div>
      <span class="match-count">{{ matches.length }} Matches</span>
    </div>
    <BracketTree
      v-if="matches.length && stage.type === 'knockout'"
      :matches="matches"
      :live="live"
    />
    <div v-else-if="matches.length" class="match-list">
      <div v-for="m in matches" :key="m.id" class="match-row">
        <PlayerTag
          class="side"
          :class="{ win: m.winnerId === m.participantAId }"
          :id="m.participantAId"
          :size="20"
        />
        <strong class="score">{{ m.legsA }}–{{ m.legsB }}</strong>
        <PlayerTag
          class="side"
          :class="{ win: m.winnerId === m.participantBId }"
          :id="m.participantBId"
          :size="20"
        />
      </div>
    </div>
    <p v-else class="pd-muted">
      {{
        stage.type === 'knockout' && afterGroups
          ? 'Wird nach der Gruppenphase aus der Tabelle ausgelost.'
          : 'Wird beim Turnierstart ausgelost.'
      }}
    </p>
  </section>
</template>

<style scoped>
.stage-card {
  min-width: 0;
}

/* A bracket needs the full row: its columns double with every earlier round. */
.stage-card--wide {
  grid-column: 1 / -1;
}

.stage-card-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--pd-space-4);
}

.stage-card-heading > div {
  display: grid;
  gap: var(--pd-space-1);
}

.match-count {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  padding: var(--pd-space-1) var(--pd-space-2);
  border: 1px solid var(--pd-border-strong);
  border-radius: var(--pd-radius-sm);
  color: var(--pd-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

.match-row .side:last-child {
  justify-self: end;
}

.score {
  color: var(--pd-text-muted);
  font-variant-numeric: tabular-nums;
}

.win {
  color: var(--pd-success);
  font-weight: 700;
}

@media (max-width: 40rem) {
  .stage-card-heading {
    flex-wrap: wrap;
  }
}
</style>
