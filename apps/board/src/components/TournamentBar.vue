<script setup lang="ts">
import { ref } from 'vue'
import { useTournamentClient } from '../game/tournamentClient'

// Compact panel shown on the setup screen for joining a server-hosted tournament.
// Purely additive — ignoring it leaves the board in normal offline mode.
const client = useTournamentClient()
const { connected, serverUrl, boardName, snapshot, errorMsg } = client

const urlInput = ref(serverUrl.value)
const tournamentId = ref('')
const expanded = ref(false)

function connect() {
  client.connect(urlInput.value)
}

function subscribe() {
  if (tournamentId.value.trim()) client.subscribe(tournamentId.value.trim())
}
</script>

<template>
  <div class="tbar">
    <button class="toggle" @click="expanded = !expanded">
      {{ connected ? '🟢' : '⚪️' }} Tournament {{ expanded ? '▲' : '▼' }}
    </button>

    <div v-if="expanded" class="body">
      <div class="line">
        <input v-model="urlInput" placeholder="http://server-ip:3000" />
        <input v-model="boardName" placeholder="Board name" style="max-width: 9rem" />
        <button @click="connect">{{ connected ? 'Reconnect' : 'Connect' }}</button>
      </div>

      <div class="line">
        <input v-model="tournamentId" placeholder="Tournament ID" />
        <button :disabled="!connected" @click="subscribe">Subscribe</button>
      </div>

      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

      <div v-if="snapshot" class="matches">
        <div class="hint">Ready matches — tap to claim:</div>
        <div class="chips">
          <button
            v-for="m in snapshot.matches.filter((x) => x.status === 'ready')"
            :key="m.id"
            class="chip"
            @click="client.claim(m.id)"
          >
            R{{ m.round + 1 }} · M{{ m.slot + 1 }}
          </button>
          <span v-if="!snapshot.matches.some((x) => x.status === 'ready')" class="hint">
            none yet
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tbar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.toggle {
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  padding: 10px 16px;
  font-weight: 700;
  min-height: 44px;
  cursor: pointer;
}

.body {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(90vw, 360px);
}

.line {
  display: flex;
  gap: 8px;
}

input {
  flex: 1;
  min-width: 0;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  padding: 10px;
  min-height: 44px;
}

button {
  background: #334155;
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  padding: 10px 14px;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  background: #0891b2;
  border: none;
  color: #04283b;
  font-weight: 700;
}

.hint {
  color: #94a3b8;
  font-size: 14px;
}

.err {
  color: #f87171;
  margin: 0;
  font-size: 14px;
}
</style>
