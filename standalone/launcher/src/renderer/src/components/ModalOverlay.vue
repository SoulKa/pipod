<script setup lang="ts">
// Shared modal chrome: scrim, panel frame, header with title + Close.
// Click the scrim (but not the panel) to dismiss.
withDefaults(defineProps<{ title: string; width?: number }>(), { width: 520 })
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <section class="panel" :style="{ '--panel-width': `${width}px` }">
      <header class="head">
        <h2>{{ title }}</h2>
        <div class="head-tools">
          <slot name="head-tools" />
          <button @click="$emit('close')">Close</button>
        </div>
      </header>

      <slot />
    </section>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.panel {
  width: min(var(--panel-width), 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.head h2 {
  margin: 0;
  font-size: 20px;
}

.head-tools {
  display: flex;
  gap: 10px;
}
</style>
