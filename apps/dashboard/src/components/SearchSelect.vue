<script setup lang="ts" generic="T">
import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

const props = defineProps<{
  // Label of the currently-saved selection, shown above the search box.
  current: string
  placeholder: string
  search: (query: string) => Promise<T[]>
  optionLabel: (item: T) => string
}>()
const emit = defineEmits<{ select: [T] }>()

const query = ref('')
// Cast keeps the generic element type through the ref in a `<script setup generic>` component.
const results = ref([]) as Ref<T[]>
const loading = ref(false)
let debounce: ReturnType<typeof setTimeout> | null = null

function onInput() {
  if (debounce !== null) clearTimeout(debounce)
  // Debounce so we don't fire a request on every keystroke of the on-screen keyboard.
  debounce = setTimeout(() => void run(), 300)
}

async function run() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    return
  }
  loading.value = true
  try {
    results.value = await props.search(q)
  } finally {
    loading.value = false
  }
}

function choose(item: T) {
  emit('select', item)
  query.value = ''
  results.value = []
}

onUnmounted(() => {
  if (debounce !== null) clearTimeout(debounce)
})
</script>

<template>
  <div>
    <p class="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
      Current: <span class="text-neutral-900 dark:text-white font-medium">{{ current }}</span>
    </p>
    <input
      v-model="query"
      type="search"
      :placeholder="placeholder"
      class="w-full min-h-12 px-4 rounded-xl bg-neutral-200/60 dark:bg-neutral-800/60 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-cyan-600"
      @input="onInput"
    />
    <p v-if="loading" class="mt-2 text-sm text-neutral-400">Searching…</p>
    <ul v-else-if="results.length" class="mt-2 flex flex-col gap-1">
      <li v-for="(item, i) in results" :key="i">
        <button
          type="button"
          class="w-full min-h-12 px-4 text-left rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-cyan-600 hover:text-white active:scale-95 transition-colors"
          @click="choose(item)"
        >
          {{ optionLabel(item) }}
        </button>
      </li>
    </ul>
    <p v-else-if="query.trim() && !loading" class="mt-2 text-sm text-neutral-400">No matches.</p>
  </div>
</template>
