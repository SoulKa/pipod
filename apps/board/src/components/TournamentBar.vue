<script setup lang="ts">
import { ref } from 'vue'
import { useTournamentClient } from '../game/tournamentClient'

// Compact panel shown on the setup screen for joining a server-hosted tournament.
// Purely additive — ignoring it leaves the board in normal offline mode.
const client = useTournamentClient()
const { connected, serverUrl, tournaments, tournamentId, floors, floorId, assignment, errorMsg } =
  client

const urlInput = ref(serverUrl.value)
const expanded = ref(false)

function connect() {
  client.connect(urlInput.value)
}

async function chooseTournament(event: Event) {
  try {
    await client.selectTournament((event.target as HTMLSelectElement).value)
  } catch (err) {
    // The client surfaces fetch errors in the panel without interrupting offline scoring.
    void err
  }
}

function chooseFloor(event: Event) {
  client.selectFloor((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="tbar">
    <button class="toggle" @click="expanded = !expanded">
      {{ connected ? '🟢' : '⚪️' }} Tournament {{ expanded ? '▲' : '▼' }}
    </button>

    <div v-if="expanded" class="body">
      <div class="line">
        <input v-model="urlInput" placeholder="Host IP (e.g. 192.168.1.20)" />
        <button @click="connect">{{ connected ? 'Reconnect' : 'Connect' }}</button>
      </div>

      <div v-if="connected" class="stack">
        <select :value="tournamentId" @change="chooseTournament">
          <option value="">Select tournament</option>
          <option v-for="tournament in tournaments" :key="tournament.id" :value="tournament.id">
            {{ tournament.name }}
          </option>
        </select>
        <select :value="floorId" :disabled="!tournamentId" @change="chooseFloor">
          <option value="">Select floor</option>
          <option v-for="floor in floors" :key="floor.id" :value="floor.id">
            {{ floor.name }}
          </option>
        </select>
        <p v-if="floorId" class="hint">This board is the input device for the selected floor.</p>
        <p v-if="assignment" class="hint">Match assigned — starting on the board.</p>
      </div>

      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
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

.stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

input,
select {
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
