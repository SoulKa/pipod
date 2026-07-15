<script setup lang="ts">
import { computed } from 'vue'
import type { NetworkState } from '../../../shared/types'

const props = defineProps<{ state: NetworkState }>()

// The kiosk connects over Wi-Fi, but treat a wired link as "connected" too so the icon isn't
// misleading on a dev machine / ethernet-attached Pi.
const connected = computed(() => props.state.wifi || props.state.online)
</script>

<template>
  <!--
    Wi-Fi glyph. Electron's `net` module only exposes binary connectivity (net.isOnline), not
    signal strength, so this renders connected vs. disconnected rather than graded bars. If a real
    signal source is added later (e.g. `node-wifi` or parsing `iw`), extend NetworkState with a
    level and render the arcs progressively here.
  -->
  <span class="wifi" :title="connected ? 'Wi-Fi connected' : 'Wi-Fi disconnected'">
    <svg class="wifi-icon" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="currentColor" :class="{ 'wifi--off': !connected }">
        <path
          d="M15.384 6.115a.485.485 0 0 0-.047-.736A12.444 12.444 0 0 0 8 3C5.259 3 2.723 3.882.663 5.379a.485.485 0 0 0-.048.736.518.518 0 0 0 .668.05A11.448 11.448 0 0 1 8 4c2.507 0 4.827.802 6.716 2.164.205.148.49.13.668-.049Z"
        />
        <path
          d="M13.229 8.271a.482.482 0 0 0-.063-.745A9.455 9.455 0 0 0 8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065A8.46 8.46 0 0 1 8 7a8.46 8.46 0 0 1 4.576 1.336c.206.132.48.108.653-.065ZM11.06 10.44c.196-.196.198-.52-.04-.66A5.5 5.5 0 0 0 8 9a5.5 5.5 0 0 0-3.02.78c-.238.14-.236.464-.04.66l.015.015c.16.16.407.19.611.09A4.507 4.507 0 0 1 8 10c.68 0 1.32.15 1.884.415.204.1.451.07.611-.09l.015-.015ZM9.06 12.44c.196-.196.197-.519-.06-.681A2 2 0 0 0 8 11.5a2 2 0 0 0-1 .259c-.257.162-.256.485-.06.681l.708.709a.5.5 0 0 0 .707 0l.707-.709Z"
        />
      </g>
      <line
        v-if="!connected"
        x1="2.5"
        y1="13.5"
        x2="13.5"
        y2="2.5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  </span>
</template>

<style scoped>
.wifi {
  display: flex;
  align-items: center;
}

.wifi-icon {
  width: 17px;
  height: 17px;
}

/* dim the Wi-Fi arcs when the link is down (the slash line stays full-strength) */
.wifi--off {
  opacity: 0.35;
}
</style>
