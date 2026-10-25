<script setup lang="ts">
// One phase in the admin setup: an on/off toggle plus the match rules every phase has.
// The phase's own setting (group count, qualifiers) goes in the default slot.
import { computed } from 'vue'
import { START_SCORES, type OutMode, type StageType } from '@pipod/shared'
import type { PhaseRules } from '../phaseForm'
import { outModeLabel, phaseLabel } from '../phases'

const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11]
const OUT_MODES: OutMode[] = ['single', 'double']

const props = defineProps<{
  phase: StageType
  description: string
  disabled?: boolean
}>()

const enabled = defineModel<boolean>('enabled', { required: true })
const rules = defineModel<PhaseRules>('rules', { required: true })

/** A two-way binding for one rule, replacing the object so the parent sees the change. */
function rule<K extends keyof PhaseRules>(key: K) {
  return computed({
    get: () => rules.value[key],
    set: (value: PhaseRules[K]) => (rules.value = { ...rules.value, [key]: value }),
  })
}
const bestOf = rule('bestOf')
const startScore = rule('startScore')
const outMode = rule('outMode')

const label = computed(() => phaseLabel(props.phase))
</script>

<template>
  <article :class="enabled ? 'phase-card phase-card--on' : 'phase-card'" :data-phase="phase">
    <label class="phase-toggle">
      <input v-model="enabled" type="checkbox" :disabled="disabled" />
      <span>{{ label }}</span>
      <small class="pd-muted">{{ description }}</small>
    </label>
    <div v-if="enabled" class="phase-settings">
      <slot />
      <label>
        <span>Best of</span>
        <select v-model.number="bestOf" :aria-label="`Best of ${label}`" :disabled="disabled">
          <option v-for="n in BEST_OF_OPTIONS" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label>
        <span>Start</span>
        <select
          v-model.number="startScore"
          :aria-label="`Startpunktzahl ${label}`"
          :disabled="disabled"
        >
          <option v-for="score in START_SCORES" :key="score" :value="score">
            {{ score }}
          </option>
        </select>
      </label>
      <label>
        <span>Checkout</span>
        <select v-model="outMode" :aria-label="`Checkout-Modus ${label}`" :disabled="disabled">
          <option v-for="mode in OUT_MODES" :key="mode" :value="mode">
            {{ outModeLabel(mode) }}
          </option>
        </select>
      </label>
    </div>
  </article>
</template>

<style scoped>
.phase-card {
  display: grid;
  align-content: start;
  gap: var(--pd-space-3);
  padding: var(--pd-space-3);
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius-sm);
  opacity: 0.7;
}

.phase-card--on {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  opacity: 1;
}

.phase-toggle {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: var(--pd-space-2);
  min-height: 2.75rem;
  cursor: pointer;
  font-weight: 750;
}

.phase-toggle input {
  width: 1.25rem;
  height: 1.25rem;
}

.phase-toggle small {
  grid-column: 2;
  font-weight: 500;
}

.phase-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--pd-space-2);
}

/* :deep so the phase's own field, passed in through the slot, matches the shared ones. */
.phase-settings :deep(label) {
  display: grid;
  min-width: 0;
  gap: var(--pd-space-1);
  color: var(--pd-text-muted);
  font-size: 0.85rem;
}

.phase-settings :deep(select) {
  width: 100%;
  min-width: 0;
}
</style>
