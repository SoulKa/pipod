<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    maxlength?: number
    label?: string
  }>(),
  { maxlength: 12, label: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  close: []
}>()

const NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

// Manual shift (one-shot). Combined with auto-capitalisation below.
const manualShift = ref(false)

// Auto-capitalise the first letter and letters after a space.
const autoShift = computed(() => props.modelValue === '' || props.modelValue.endsWith(' '))
const upper = computed(() => manualShift.value || autoShift.value)

const atLimit = computed(() => props.modelValue.length >= props.maxlength)

function append(char: string) {
  if (atLimit.value) return
  emit('update:modelValue', props.modelValue + char)
}

function pressLetter(letter: string) {
  if (atLimit.value) return
  emit('update:modelValue', props.modelValue + (upper.value ? letter.toUpperCase() : letter))
  manualShift.value = false
}

function backspace() {
  emit('update:modelValue', props.modelValue.slice(0, -1))
}

function toggleShift() {
  manualShift.value = !manualShift.value
}
</script>

<template>
  <div class="kb">
    <div class="kb-head">
      <span class="kb-label">{{ label || 'Enter name' }}</span>
      <span class="kb-value">{{ modelValue || ' ' }}<span class="caret"></span></span>
      <button class="done" @click="emit('close')">Done</button>
    </div>

    <div class="kb-row">
      <button v-for="d in NUMBERS" :key="d" class="key" @click="append(d)">{{ d }}</button>
    </div>
    <div v-for="(row, r) in ROWS" :key="r" class="kb-row">
      <button v-for="letter in row" :key="letter" class="key" @click="pressLetter(letter)">
        {{ upper ? letter.toUpperCase() : letter }}
      </button>
    </div>

    <div class="kb-row">
      <button class="key wide" :class="{ armed: manualShift }" @click="toggleShift">⇧</button>
      <button class="key space" @click="append(' ')">space</button>
      <button class="key wide" @click="backspace">⌫</button>
    </div>
  </div>
</template>

<style scoped>
.kb {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: #0a0f1c;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
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
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.kb-value {
  flex: 1;
  font-size: 28px;
  font-weight: 800;
  color: #f1f5f9;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret {
  display: inline-block;
  width: 3px;
  height: 26px;
  background: #22d3ee;
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    opacity: 0;
  }
}

.done {
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, #22d3ee, #0891b2);
  color: #04283b;
  font-size: 20px;
  font-weight: 800;
  padding: 14px 26px;
  min-height: 48px;
  cursor: pointer;
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
  background: linear-gradient(180deg, #e2e8f0, #cbd5e1);
  color: #0b1220;
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
  background: linear-gradient(180deg, #475569, #334155);
  color: #f1f5f9;
}

.key.wide.armed {
  background: linear-gradient(180deg, #fb923c, #ea580c);
}

.key.space {
  flex: 5;
  background: linear-gradient(180deg, #94a3b8, #64748b);
  color: #f8fafc;
  font-size: 20px;
}
</style>
