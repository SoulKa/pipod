<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, RouterLink } from 'vue-router'
import LogTerminal from './components/LogTerminal.vue'
import { useServerLogs } from './serverLogs'

// The log feed runs for the whole session, not just while the drawer is open: the server
// forwards live lines only, so subscribing on open would show an empty terminal.
const { lines, connected, start, stop, clear } = useServerLogs()
const showLogs = ref(false)
/** Highest sequence number the operator has already seen in the open terminal. */
const seenSeq = ref(0)

const problems = computed(
  () =>
    lines.value.filter(
      (line) =>
        line.seq > seenSeq.value &&
        (line.level === 'warn' || line.level === 'error' || line.level === 'fatal'),
    ).length,
)

function onKeydown(event: KeyboardEvent): void {
  // Ctrl+` like an IDE terminal; Escape closes it again.
  if (event.ctrlKey && event.key === '`') {
    event.preventDefault()
    showLogs.value = !showLogs.value
  } else if (event.key === 'Escape' && showLogs.value) {
    showLogs.value = false
  }
}

// While the terminal is open every line counts as seen, so the badge only ever reports
// what happened out of sight.
watch([showLogs, lines], () => {
  if (showLogs.value) seenSeq.value = lines.value.at(-1)?.seq ?? seenSeq.value
})

onMounted(() => {
  start()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stop()
})
</script>

<template>
  <div class="console-app">
    <header class="console-topbar">
      <RouterLink class="console-brand" to="/admin">🎯 Pi-Darts Konsole</RouterLink>
      <nav class="console-nav pd-row">
        <RouterLink to="/admin">Admin</RouterLink>
        <button
          type="button"
          class="console-logs-toggle"
          :class="showLogs ? 'is-open' : ''"
          :aria-pressed="showLogs"
          title="Server-Logs ein-/ausblenden (Ctrl+`)"
          @click="showLogs = !showLogs"
        >
          Logs
          <span v-if="problems && !showLogs" class="console-logs-badge">{{ problems }}</span>
        </button>
      </nav>
    </header>
    <main class="console-content">
      <RouterView />
    </main>
    <LogTerminal
      v-if="showLogs"
      :lines="lines"
      :connected="connected"
      @clear="clear"
      @close="showLogs = false"
    />
  </div>
</template>

<style scoped>
.console-logs-toggle {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: var(--pd-space-2);
  padding: var(--pd-space-2) var(--pd-space-3);
  font-size: 0.9rem;
}

.console-logs-toggle.is-open {
  border-color: var(--pd-border-accent);
  background: var(--pd-accent-soft);
  color: var(--pd-accent);
}

.console-logs-badge {
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--pd-warning-soft);
  color: var(--pd-warning);
  font-size: 0.75rem;
  font-weight: 700;
}
</style>
