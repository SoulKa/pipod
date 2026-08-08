// Live server log feed for the log terminal. The server keeps no history, so this
// composable subscribes as soon as the console opens and buffers what arrives in the
// tab — opening the terminal then shows the current session instead of an empty screen.
import { ref, shallowRef } from 'vue'
import type { LogLine } from '@pipod/shared'
import { createSocket, type ConsoleSocket } from './socket'

/** Cap on buffered lines; a busy tournament produces a few per leg. */
export const MAX_LOG_LINES = 500

export function useServerLogs() {
  const lines = ref<LogLine[]>([])
  const connected = ref(false)
  const socket = shallowRef<ConsoleSocket | null>(null)

  function start(): void {
    if (socket.value) return
    const s = createSocket()
    socket.value = s
    s.on('connect', () => {
      connected.value = true
      s.emit('logs:subscribe')
    })
    s.on('disconnect', () => (connected.value = false))
    s.on('log:line', (line) => {
      const next = lines.value.concat(line)
      lines.value = next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
    })
  }

  function stop(): void {
    socket.value?.disconnect()
    socket.value = null
    connected.value = false
  }

  function clear(): void {
    lines.value = []
  }

  return { lines, connected, start, stop, clear }
}
