<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { clearKeyboardHeight, publishKeyboardHeight } from './keyboardHeight'

const props = withDefaults(
  defineProps<{
    modelValue: string
    maxlength?: number
    label?: string
    doneLabel?: string
  }>(),
  { maxlength: 40, label: '', doneLabel: '✓' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  close: []
}>()

const NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
// QWERTZ with umlauts, plus the punctuation that shows up in German place names
// ("Stuttgart, Hbf", "Bad Cannstatt-Wilhelmsplatz").
const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm', 'ß', '.', '-', ','],
]

// Manual shift (one-shot). Combined with auto-capitalisation below.
const manualShift = ref(false)

// Auto-capitalise the first letter and letters after a space.
const autoShift = computed(() => props.modelValue === '' || props.modelValue.endsWith(' '))
const upper = computed(() => manualShift.value || autoShift.value)

const atLimit = computed(() => props.modelValue.length >= props.maxlength)

// Uppercase only where it stays a single character: "ß".toUpperCase() is "SS", which would
// silently insert two characters and blow past maxlength.
function shifted(key: string): string {
  const up = key.toUpperCase()
  return up.length === 1 ? up : key
}

function display(key: string): string {
  return upper.value ? shifted(key) : key
}

function append(char: string) {
  if (atLimit.value) return
  emit('update:modelValue', props.modelValue + char)
}

function pressKey(key: string) {
  if (atLimit.value) return
  emit('update:modelValue', props.modelValue + display(key))
  manualShift.value = false
}

function backspace() {
  emit('update:modelValue', props.modelValue.slice(0, -1))
}

function toggleShift() {
  manualShift.value = !manualShift.value
}

const root = ref<HTMLElement | null>(null)

onMounted(() => {
  publishKeyboardHeight(root.value?.offsetHeight ?? 0)
})

onBeforeUnmount(() => {
  clearKeyboardHeight()
})
</script>

<template>
  <div ref="root" class="kb">
    <div class="kb-head">
      <span v-if="label" class="kb-label">{{ label }}</span>
      <span class="kb-value">{{ modelValue || ' ' }}<span class="caret"></span></span>
    </div>

    <div class="kb-row">
      <button v-for="d in NUMBERS" :key="d" class="key" @click="append(d)">{{ d }}</button>
    </div>
    <div v-for="(row, r) in ROWS" :key="r" class="kb-row">
      <button v-for="key in row" :key="key" class="key" @click="pressKey(key)">
        {{ display(key) }}
      </button>
    </div>

    <div class="kb-row">
      <button
        class="key wide"
        :class="manualShift ? 'armed' : ''"
        aria-label="Shift"
        @click="toggleShift"
      >
        ⇧︎
      </button>
      <button class="key space" aria-label="Space" @click="append(' ')"></button>
      <button class="key wide" aria-label="Backspace" @click="backspace">⌫︎</button>
      <button
        class="key done"
        :class="doneLabel.length > 1 ? 'text' : ''"
        aria-label="Done"
        @click="emit('close')"
      >
        {{ doneLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Colours come from --kb-* custom properties so a host app can retheme the keyboard; the
   defaults are the board's dark palette. */
.kb {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: var(--kb-bg, #0a0f1c);
  border-top: 1px solid var(--kb-border, rgba(148, 163, 184, 0.2));
  padding: 14px 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.6);
}

.kb-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 6px 10px;
}

.kb-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--kb-label-fg, #64748b);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.kb-value {
  flex: 1;
  font-size: 28px;
  font-weight: 800;
  color: var(--kb-value-fg, #f1f5f9);
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret {
  display: inline-block;
  width: 3px;
  height: 26px;
  background: var(--kb-accent, #22d3ee);
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    opacity: 0;
  }
}

.kb-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.key {
  flex: 1;
  height: 62px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, var(--kb-key-bg, #e2e8f0), var(--kb-key-bg-active, #cbd5e1));
  color: var(--kb-key-fg, #0b1220);
  font-size: 26px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: inset 0 -3px 0 rgba(15, 23, 42, 0.25);
  touch-action: manipulation;
}

.key:active {
  transform: translateY(2px);
  box-shadow: none;
}

.key.wide {
  flex: 1.6;
  background: linear-gradient(180deg, var(--kb-mod-bg, #475569), var(--kb-mod-bg-active, #334155));
  color: var(--kb-mod-fg, #f1f5f9);
}

.key.wide.armed {
  background: linear-gradient(
    180deg,
    var(--kb-shift-armed, #fb923c),
    var(--kb-shift-armed-active, #ea580c)
  );
}

.key.space {
  flex: 5;
  background: linear-gradient(
    180deg,
    var(--kb-space-bg, #94a3b8),
    var(--kb-space-bg-active, #64748b)
  );
  color: var(--kb-space-fg, #f8fafc);
  font-size: 20px;
}

.key.done {
  flex: 1.6;
  background: linear-gradient(180deg, var(--kb-accent, #22d3ee), var(--kb-accent-active, #0891b2));
  color: var(--kb-accent-fg, #04283b);
  font-size: 30px;
}

/* A worded label ("Fertig") needs more room than the ✓ glyph. */
.key.done.text {
  flex: 2.6;
  font-size: 20px;
}
</style>
