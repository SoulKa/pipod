<script setup lang="ts">
import { dartLabel, type CheckoutRoute } from '../game/checkout'

const props = defineProps<{
  routes: CheckoutRoute[]
}>()
</script>

<template>
  <div v-if="props.routes.length" class="checkout">
    <span class="caption">Checkout</span>
    <div class="routes">
      <div v-for="route in props.routes" :key="route.label" class="route">
        <span v-for="(d, i) in route.darts" :key="i" class="dart">
          {{ dartLabel(d.base, d.multiplier) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkout {
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(160deg, #172033, #0e1524);
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 14px;
  padding: 10px 14px;
}

.caption {
  flex: none;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #22d3ee;
}

.routes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  min-width: 0;
}

.route {
  display: flex;
  gap: 6px;
}

.dart {
  padding: 5px 12px;
  border-radius: 9px;
  background: rgba(34, 211, 238, 0.12);
  color: #e2f8ff;
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
</style>
