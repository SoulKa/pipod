<script setup lang="ts">
import type { ThemePreference } from '@/composables/useSettings'

defineProps<{ modelValue: ThemePreference }>()
const emit = defineEmits<{ 'update:modelValue': [ThemePreference] }>()

// Symbols mirror the ones the old toggle button cycled through.
const OPTIONS: { value: ThemePreference; label: string; symbol: string }[] = [
  { value: 'auto', label: 'Auto', symbol: '◐' },
  { value: 'light', label: 'Light', symbol: '☀' },
  { value: 'dark', label: 'Dark', symbol: '☾' },
]
</script>

<template>
  <div
    class="flex gap-1 p-1 rounded-2xl bg-neutral-200/60 dark:bg-neutral-800/60"
    role="radiogroup"
  >
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === opt.value"
      class="flex-1 min-h-12 px-4 rounded-xl flex items-center justify-center gap-2 text-base font-medium transition-colors active:scale-95"
      :class="
        modelValue === opt.value
          ? 'bg-cyan-600 text-white shadow'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-300/60 dark:hover:bg-neutral-700/60'
      "
      @click="emit('update:modelValue', opt.value)"
    >
      <span class="text-xl leading-none">{{ opt.symbol }}</span>
      <span>{{ opt.label }}</span>
    </button>
  </div>
</template>
