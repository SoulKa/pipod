<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { LiveMatchState, Match } from '@pipod/shared'
import { activeRoundIndex, buildBracketRounds, championOf } from '../bracket'

const props = defineProps<{
  matches: Match[]
  nameOf: (id: string | null) => string
  live: Map<string, LiveMatchState>
}>()

/** Widest a single match card is allowed to get, and the column width it implies. */
const CELL_REM = 13

const rounds = computed(() => buildBracketRounds(props.matches))
const champion = computed(() => championOf(rounds.value))
const activeIndex = computed(() => activeRoundIndex(rounds.value))

/**
 * Every round row spans the same width so the columns of the first round line up with
 * the connectors below them; the inner element is sized to the widest round and the
 * whole tree scrolls horizontally as one.
 */
const innerStyle = computed(() => {
  const widest = rounds.value.reduce((max, r) => Math.max(max, r.matches.length), 0)
  return `min-width: ${widest * CELL_REM}rem`
})

/** Rounds plus the connector shape of the gap beneath each (empty under the final). */
const rows = computed(() =>
  rounds.value.map((round, i) => ({
    ...round,
    feeders: i < rounds.value.length - 1 ? round.matches.length : 0,
    receivers: i < rounds.value.length - 1 ? rounds.value[i + 1]!.matches.length : 0,
  })),
)

const isWinner = (match: Match, participantId: string | null) =>
  !!match.winnerId && match.winnerId === participantId

/** Legs won, preferring the in-memory live mirror over the persisted tally. */
function legsOf(match: Match): { a: number; b: number } {
  const state = props.live.get(match.id)
  return { a: state?.legsA ?? match.legsA, b: state?.legsB ?? match.legsB }
}

const roundEls = ref<HTMLElement[]>([])
function captureRoundEl(el: unknown, index: number): void {
  if (el instanceof HTMLElement) roundEls.value[index] = el
}

/** A finished bracket has no active round, so park on the final. */
function scrollToActive(): void {
  // Resolved after the DOM settles: on mount the row refs do not exist yet.
  void nextTick(() => {
    const target = roundEls.value[activeIndex.value ?? rounds.value.length - 1]
    if (!target) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  })
}

onMounted(scrollToActive)

// Follow the tournament down the tree when the round in play changes — but not on
// every reported leg, so a viewer reading an earlier round isn't dragged back mid-round.
watch(activeIndex, scrollToActive)
</script>

<template>
  <div class="bracket">
    <div class="bracket-scroll">
      <div class="bracket-inner" :style="innerStyle">
        <template v-for="(row, i) in rows" :key="row.round">
          <section :ref="(el) => captureRoundEl(el, i)" class="round">
            <p class="round-label">{{ row.label }}</p>
            <div class="round-row">
              <div v-for="m in row.matches" :key="m.id" class="cell">
                <article class="match" :class="{ 'match--live': m.status === 'live' }">
                  <div class="side" :class="{ win: isWinner(m, m.participantAId) }">
                    <span class="pname">{{ nameOf(m.participantAId) }}</span>
                    <span class="legs">{{ legsOf(m).a }}</span>
                  </div>
                  <div class="side" :class="{ win: isWinner(m, m.participantBId) }">
                    <span class="pname">{{ nameOf(m.participantBId) }}</span>
                    <span class="legs">{{ legsOf(m).b }}</span>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <!-- Elbows joining each pair of feeder matches to the match they advance into. -->
          <div v-if="row.receivers" class="gap">
            <div class="gap-up">
              <span v-for="n in row.feeders" :key="n" class="stub"></span>
            </div>
            <div class="gap-join">
              <span v-for="n in row.receivers" :key="n" class="join"></span>
            </div>
            <div class="gap-down">
              <span v-for="n in row.receivers" :key="n" class="stub"></span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <p v-if="champion" class="champion">
      <span class="champion-label">🏆 Sieger</span>
      <strong class="champion-name">{{ nameOf(champion) }}</strong>
    </p>
  </div>
</template>

<style scoped>
.bracket {
  display: grid;
  gap: var(--pd-space-4);
}

/* Only the tree scrolls sideways; the champion banner below spans the card instead of
   stretching to the bracket's (much wider) scroll width. */
.bracket-scroll {
  overflow-x: auto;
}

.bracket-inner {
  display: grid;
}

.round-label {
  margin-bottom: var(--pd-space-1);
  color: var(--pd-text-dim);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.round-row,
.gap-up,
.gap-join,
.gap-down {
  display: flex;
}

.cell {
  display: flex;
  flex: 1;
  justify-content: center;
  min-width: 0;
  padding: 0 var(--pd-space-2);
}

.match {
  display: grid;
  gap: 1px;
  width: 100%;
  padding: var(--pd-space-2);
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-surface);
}

.match--live {
  border-color: var(--pd-border-accent);
  background: var(--pd-surface-gradient);
}

.side {
  display: flex;
  justify-content: space-between;
  gap: var(--pd-space-2);
  min-width: 0;
  color: var(--pd-text-soft);
}

.side.win {
  color: var(--pd-success);
  font-weight: 700;
}

.pname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legs {
  flex: 0 0 auto;
  color: var(--pd-text-muted);
  font-variant-numeric: tabular-nums;
}

.side.win .legs {
  color: inherit;
}

/* A stub is a vertical tick centred in its column; a join is the horizontal bar whose
   25% side insets land it exactly on the centres of the two columns it spans. */
.stub {
  flex: 1;
}

.stub::before {
  display: block;
  width: 0;
  height: 100%;
  border-left: 1px solid var(--pd-border-strong);
  margin: 0 auto;
  content: '';
}

.gap-up,
.gap-down {
  height: var(--pd-space-3);
}

.join {
  flex: 1;
  border-top: 1px solid var(--pd-border-strong);
  margin: 0 25%;
}

.champion {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-1);
  width: 100%;
  padding: var(--pd-space-4) var(--pd-space-3);
  border: 1px solid var(--pd-success);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-success-soft);
  color: var(--pd-success);
  text-align: center;
}

.champion-label {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.champion-name {
  overflow: hidden;
  max-width: 100%;
  font-size: clamp(1.75rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
  text-overflow: ellipsis;
}
</style>
