<script setup lang="ts">
// Bottom-drawer terminal for the live server log. Filtering happens here rather than on
// the server: the stream always carries debug and up, so switching level is instant.
import { computed, nextTick, ref, watch } from 'vue'
import type { LogLevel, LogLine } from '@pipod/shared'

const props = defineProps<{ lines: LogLine[]; connected: boolean }>()
const emit = defineEmits<{ close: []; clear: [] }>()

const RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

const LEVEL_OPTIONS: { value: LogLevel; label: string }[] = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnung' },
  { value: 'error', label: 'Fehler' },
]

const MIN_HEIGHT = 120
const MAX_HEIGHT_RATIO = 0.8

const minLevel = ref<LogLevel>('debug')
const query = ref('')
const paused = ref(false)
const height = ref(280)
const viewport = ref<HTMLElement | null>(null)
/** Only pull the view along when it is already at the bottom, so scrolling back stays put. */
const atBottom = ref(true)

/** A pause freezes what is on screen; the buffer behind it keeps filling. */
const frozen = ref<LogLine[]>([])

const visible = computed(() => {
  const source = paused.value ? frozen.value : props.lines
  const needle = query.value.trim().toLowerCase()
  return source.filter((line) => {
    if (RANK[line.level] < RANK[minLevel.value]) return false
    if (!needle) return true
    return searchText(line).includes(needle)
  })
})

const hiddenCount = computed(() => props.lines.length - visible.value.length)

function searchText(line: LogLine): string {
  const fields = line.fields ? Object.entries(line.fields).map(([k, v]) => `${k}=${v}`) : []
  return `${line.level} ${line.message} ${fields.join(' ')}`.toLowerCase()
}

function fieldEntries(line: LogLine): [string, string][] {
  return line.fields ? Object.entries(line.fields) : []
}

/** `12:04:31` — the console runs next to the server, so local time is the useful one. */
function formatTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '--:--:--'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

function togglePause(): void {
  // Snapshot on the way in, so unpausing simply reveals everything that piled up.
  if (!paused.value) frozen.value = props.lines.slice()
  paused.value = !paused.value
}

function onScroll(): void {
  const el = viewport.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 32
}

function startResize(event: PointerEvent): void {
  const startY = event.clientY
  const startHeight = height.value
  const max = window.innerHeight * MAX_HEIGHT_RATIO
  const onMove = (move: PointerEvent) => {
    height.value = Math.min(max, Math.max(MIN_HEIGHT, startHeight + (startY - move.clientY)))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

watch(
  () => visible.value.length,
  async () => {
    if (paused.value || !atBottom.value) return
    await nextTick()
    const el = viewport.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<template>
  <section class="log-terminal" :style="{ height: `${height}px` }" aria-label="Server-Logs">
    <div
      class="log-resize"
      role="separator"
      aria-orientation="horizontal"
      @pointerdown.prevent="startResize"
    ></div>

    <header class="log-bar">
      <strong class="log-title">Server-Logs</strong>
      <span class="log-state" :class="props.connected ? 'is-live' : 'is-down'">
        {{ props.connected ? 'verbunden' : 'getrennt' }}
      </span>

      <label class="log-control">
        <span class="pd-muted">Level</span>
        <select v-model="minLevel">
          <option v-for="option in LEVEL_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <input
        v-model="query"
        class="log-filter"
        type="search"
        placeholder="Filtern (Text, z.B. Feldname)"
      />

      <span v-if="hiddenCount > 0" class="pd-muted log-hidden">{{ hiddenCount }} verborgen</span>

      <div class="log-actions pd-row">
        <button type="button" :aria-pressed="paused" @click="togglePause">
          {{ paused ? 'Weiter' : 'Pause' }}
        </button>
        <button type="button" @click="emit('clear')">Leeren</button>
        <button type="button" aria-label="Logs schließen" @click="emit('close')">✕</button>
      </div>
    </header>

    <div ref="viewport" class="log-viewport" @scroll="onScroll">
      <p v-if="!visible.length" class="pd-muted log-empty">
        {{ props.lines.length ? 'Keine Zeile passt zum Filter.' : 'Noch keine Log-Zeilen.' }}
      </p>
      <div v-for="line in visible" :key="line.seq" class="log-line">
        <span class="log-time">{{ formatTime(line.time) }}</span>
        <span class="log-level" :class="`is-${line.level}`">{{ line.level.toUpperCase() }}</span>
        <span class="log-message">
          {{ line.message }}
          <span v-for="[key, value] in fieldEntries(line)" :key="key" class="log-field">
            <span class="log-field-key">{{ key }}=</span>{{ value }}
          </span>
          <pre v-if="line.stack" class="log-stack">{{ line.stack }}</pre>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.log-terminal {
  /* Sticky, so the terminal stays on screen while a long admin page scrolls behind it. */
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--pd-border-strong);
  background: var(--pd-surface-sunken);
  box-shadow: var(--pd-shadow-lg);
  font-family: var(--pd-font-mono);
}

.log-resize {
  position: absolute;
  top: -3px;
  right: 0;
  left: 0;
  height: 8px;
  cursor: ns-resize;
  touch-action: none;
}

.log-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pd-space-3);
  padding: var(--pd-space-2) var(--pd-space-4);
  border-bottom: 1px solid var(--pd-border);
  background: var(--pd-bg-subtle);
}

.log-title {
  color: var(--pd-text);
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.log-state {
  padding: 0.1rem var(--pd-space-2);
  border-radius: var(--pd-radius-sm);
  font-size: 0.75rem;
}

.log-state.is-live {
  background: var(--pd-success-soft);
  color: var(--pd-success);
}

.log-state.is-down {
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}

.log-control {
  display: inline-flex;
  align-items: center;
  gap: var(--pd-space-2);
  font-size: 0.8rem;
}

.log-filter {
  min-width: 12rem;
  flex: 1;
  font-family: var(--pd-font-mono);
  font-size: 0.8rem;
}

.log-hidden {
  font-size: 0.75rem;
}

.log-actions {
  margin-left: auto;
}

.log-actions button {
  min-height: 2.25rem;
  padding: var(--pd-space-1) var(--pd-space-3);
  font-size: 0.8rem;
}

.log-viewport {
  flex: 1;
  padding: var(--pd-space-2) var(--pd-space-4);
  overflow-y: auto;
  font-size: 0.8rem;
  line-height: 1.55;
}

.log-empty {
  padding: var(--pd-space-3) 0;
}

.log-line {
  display: flex;
  gap: var(--pd-space-3);
  padding: 0.05rem 0;
}

.log-time {
  color: var(--pd-text-dim);
  white-space: nowrap;
}

.log-level {
  width: 3.2rem;
  flex: none;
  font-weight: 700;
}

.log-level.is-debug,
.log-level.is-trace {
  color: var(--pd-text-dim);
}

.log-level.is-info {
  color: var(--pd-accent);
}

.log-level.is-warn {
  color: var(--pd-warning);
}

.log-level.is-error,
.log-level.is-fatal {
  color: var(--pd-danger);
}

.log-message {
  color: var(--pd-text-soft);
  overflow-wrap: anywhere;
}

.log-field {
  margin-left: var(--pd-space-2);
  color: var(--pd-text);
  white-space: nowrap;
}

.log-field-key {
  color: var(--pd-text-dim);
}

.log-stack {
  margin: var(--pd-space-1) 0 var(--pd-space-2);
  color: var(--pd-danger);
  font-size: 0.75rem;
  white-space: pre-wrap;
}

@media (max-width: 40rem) {
  .log-filter {
    min-width: 8rem;
  }

  .log-actions {
    margin-left: 0;
  }
}
</style>
