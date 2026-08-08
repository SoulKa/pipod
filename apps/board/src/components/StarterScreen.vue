<script setup lang="ts">
import type { Seat } from '@pipod/shared'

defineProps<{ names: [string, string] }>()

const emit = defineEmits<{ select: [seat: Seat] }>()

const SEATS: Seat[] = [0, 1]
const ACCENTS = ['#22d3ee', '#a78bfa']
</script>

<template>
  <section class="starter">
    <header>
      <h1>Wer beginnt?</h1>
      <p>Bull werfen, dann den Anwurf antippen. Die Folgelegs wechseln automatisch.</p>
    </header>

    <div class="choices">
      <button
        v-for="seat in SEATS"
        :key="seat"
        class="choice"
        :style="{ '--accent': ACCENTS[seat] }"
        @click="emit('select', seat)"
      >
        {{ names[seat] }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.starter {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 36px 28px;
}

header {
  text-align: center;
}

h1 {
  font-size: 48px;
  font-weight: 900;
  color: #f1f5f9;
}

header p {
  margin-top: 10px;
  font-size: 20px;
  font-weight: 600;
  color: #94a3b8;
}

.choices {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 24px;
}

/* Half the screen each — the only two targets on this screen, so make them unmissable. */
.choice {
  --accent: #22d3ee;
  flex: 1;
  min-width: 0;
  border-radius: 24px;
  border: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, #0b1220);
  color: #f8fafc;
  font-size: 44px;
  font-weight: 900;
  padding: 24px;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.choice:active {
  transform: scale(0.98);
  background: color-mix(in srgb, var(--accent) 26%, #0b1220);
}
</style>
