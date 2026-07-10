<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Multiplier } from '../game/useDartGame'
import type { CheckoutRoute } from '../game/checkout'

const props = defineProps<{
  disabled: boolean
  canUndo: boolean
  checkoutRoutes: CheckoutRoute[]
}>()

const emit = defineEmits<{
  throw: [base: number, multiplier: Multiplier]
  undo: []
}>()

// 1..20 then 0 (miss) then 25 (bullseye)
const numbers = [...Array.from({ length: 20 }, (_, i) => i + 1), 0, 25]

const multiplier = ref<Multiplier>(1)

function toggleMultiplier(value: Exclude<Multiplier, 1>) {
  multiplier.value = multiplier.value === value ? 1 : value
}

// Triple 25 is not a legal dart; double 25 (bullseye = 50) is allowed.
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

// One-line checkout summary (empty when there's no finish this turn).
const checkoutText = computed(() =>
  props.checkoutRoutes.length
    ? `Checkout: ${props.checkoutRoutes.map((r) => r.label).join(' · ')}`
    : '',
)

// Armed-multiplier feedback wins (it's momentary); otherwise show the checkout, else the tip.
const showingCheckout = computed(() => multiplier.value === 1 && checkoutText.value !== '')

const hint = computed(() => {
  if (multiplier.value === 2) return 'DOUBLE armed – tap a number'
  if (multiplier.value === 3) return 'TRIPLE armed – tap a number'
  if (checkoutText.value) return checkoutText.value
  return 'Tap the number that was hit'
})
</script>

<template>
  <div class="pad">
    <div class="hint" :class="{ armed: multiplier !== 1, checkout: showingCheckout }">
      {{ hint }}
    </div>

    <div class="numbers">
      <button
        v-for="n in numbers"
        :key="n"
        class="key num"
        :class="{ special: n === 0 || n === 25 }"
        :disabled="props.disabled || isIllegal(n)"
        @click="pressNumber(n)"
      >
        {{ n }}
      </button>
    </div>

    <div class="modifiers">
      <button
        class="key mod double"
        :class="{ armed: doubleActive }"
        :disabled="props.disabled"
        @click="toggleMultiplier(2)"
      >
        Double
      </button>
      <button
        class="key mod triple"
        :class="{ armed: tripleActive }"
        :disabled="props.disabled"
        @click="toggleMultiplier(3)"
      >
        Triple
      </button>
      <button class="key undo" :disabled="!props.canUndo" @click="emit('undo')">↺ Undo</button>
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

.hint {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #64748b;
  height: 28px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint.armed {
  color: #fb923c;
}

.hint.checkout {
  color: #22d3ee;
}

.numbers {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  min-height: 0;
}

.modifiers {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  height: 96px;
}

.key {
  border: none;
  border-radius: 16px;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.05s ease,
    filter 0.1s ease,
    box-shadow 0.15s ease;
  touch-action: manipulation;
}

.key:active:not(:disabled) {
  transform: translateY(2px) scale(0.98);
}

.key:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.num {
  background: linear-gradient(180deg, #f8fafc, #cbd5e1);
  color: #0b1220;
  font-size: 32px;
  box-shadow: inset 0 -3px 0 rgba(15, 23, 42, 0.25);
}

.num.special {
  background: linear-gradient(180deg, #38bdf8, #0ea5e9);
  color: #04283b;
  font-size: 24px;
}

.mod {
  font-size: 26px;
  color: #fff;
}

.double {
  background: linear-gradient(180deg, #34d399, #059669);
}

.triple {
  background: linear-gradient(180deg, #a78bfa, #7c3aed);
}

.mod.armed {
  background: linear-gradient(180deg, #fb923c, #ea580c);
  box-shadow: 0 0 24px rgba(249, 115, 22, 0.7);
}

.undo {
  background: linear-gradient(180deg, #fb7185, #e11d48);
  color: #fff;
  font-size: 24px;
}
</style>
