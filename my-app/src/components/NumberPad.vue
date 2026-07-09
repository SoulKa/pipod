<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Multiplier } from '../game/useDartGame'

const props = defineProps<{
  disabled: boolean
  canUndo: boolean
}>()

const emit = defineEmits<{
  throw: [base: number, multiplier: Multiplier]
  undo: []
}>()

// 1..20 then 0 then 25 (bullseye)
const numbers = [...Array.from({ length: 20 }, (_, i) => i + 1), 0, 25]

const multiplier = ref<Multiplier>(1)

function toggleMultiplier(value: Exclude<Multiplier, 1>) {
  multiplier.value = multiplier.value === value ? 1 : value
}

// Triple 25 is not a legal dart; disable numbers that are illegal with the armed modifier.
function isIllegal(base: number): boolean {
  return base === 25 && multiplier.value === 3
}

function pressNumber(base: number) {
  if (props.disabled || isIllegal(base)) return
  emit('throw', base, multiplier.value)
  multiplier.value = 1
}

const doubleActive = computed(() => multiplier.value === 2)
const tripleActive = computed(() => multiplier.value === 3)
</script>

<template>
  <div class="pad">
    <div class="numbers">
      <button
        v-for="n in numbers"
        :key="n"
        class="key num"
        :disabled="props.disabled || isIllegal(n)"
        @click="pressNumber(n)"
      >
        {{ n }}
      </button>
    </div>

    <div class="modifiers">
      <button
        class="key mod"
        :class="{ armed: doubleActive }"
        :disabled="props.disabled"
        @click="toggleMultiplier(2)"
      >
        Double
      </button>
      <button
        class="key mod"
        :class="{ armed: tripleActive }"
        :disabled="props.disabled"
        @click="toggleMultiplier(3)"
      >
        Triple
      </button>
      <button class="key undo" :disabled="!props.canUndo" @click="emit('undo')">Undo</button>
    </div>
  </div>
</template>

<style scoped>
.pad {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.numbers {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.modifiers {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  height: 110px;
}

.key {
  border: none;
  border-radius: 14px;
  font-weight: 800;
  cursor: pointer;
  color: #0b1220;
  transition: transform 0.05s ease, filter 0.1s ease;
  touch-action: manipulation;
}

.key:active:not(:disabled) {
  transform: scale(0.96);
}

.key:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.num {
  background: #e2e8f0;
  font-size: 34px;
}

.mod {
  background: #38bdf8;
  color: #04283b;
  font-size: 28px;
}

.mod.armed {
  background: #f97316;
  color: #fff;
  box-shadow: 0 0 20px rgba(249, 115, 22, 0.6);
}

.undo {
  background: #f87171;
  color: #fff;
  font-size: 28px;
}
</style>
