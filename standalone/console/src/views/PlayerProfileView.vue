<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AVATAR_QUICK_EMOJIS, avatarKey, isSingleEmoji } from '@pipod/shared'
import { PlayerAvatar } from '@pipod/ui'
import { api } from '../api'
import { useTournamentFeed } from '../feed'
import { toAvatarJpeg } from '../photo'

const props = defineProps<{ id: string; participantId: string }>()

const router = useRouter()
const feed = useTournamentFeed()
const { detail } = feed

onMounted(() => feed.open(props.id))
onUnmounted(() => {
  feed.close()
  clearPreview()
})

const participant = computed(() =>
  detail.value?.participants.find((p) => p.id === props.participantId),
)

const busy = ref(false)
const error = ref('')
const emojiInput = ref('')

// Compared by value: every snapshot refetch hands over new avatar objects.
const shownKey = computed(() => avatarKey(participant.value?.avatar ?? null))

// The freshly taken photo, shown until the feed shows what the server made of it. `key`
// is that picture's avatar key, null while the upload is still running.
const pending = ref<{ url: string; key: string | null } | null>(null)
const preview = computed(() =>
  pending.value && pending.value.key !== shownKey.value ? pending.value.url : null,
)

function clearPreview(): void {
  if (pending.value) URL.revokeObjectURL(pending.value.url)
  pending.value = null
}

// The feed may show the upload before or after the server answers; either way the
// preview goes once both agree, so the old picture never flashes back in between.
watch([shownKey, () => pending.value?.key], ([shown, key]) => {
  if (key === shown) clearPreview()
})

async function run(fn: () => Promise<unknown>): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    // No refresh here: the server's snapshot broadcast already reloads the feed.
    await fn()
  } catch (e) {
    error.value = (e as Error).message || 'Das hat nicht geklappt. Nochmal versuchen?'
  } finally {
    busy.value = false
  }
}

async function onPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so picking the same file again still fires `change`.
  input.value = ''
  if (!file) return
  await run(async () => {
    const jpeg = await toAvatarJpeg(file)
    clearPreview()
    pending.value = { url: URL.createObjectURL(jpeg), key: null }
    try {
      const updated = await api.setAvatarPhoto(props.participantId, jpeg)
      if (pending.value) pending.value.key = avatarKey(updated.avatar)
    } catch (e) {
      clearPreview()
      throw e
    }
  })
}

function pickEmoji(emoji: string): Promise<void> {
  return run(() => api.setAvatarEmoji(props.participantId, emoji))
}

const emojiHint = computed(() => {
  const value = emojiInput.value.trim()
  return value && !isSingleEmoji(value) ? 'Genau ein Emoji, bitte.' : ''
})

// The phone's emoji keyboard inserts one emoji per tap, so a valid value is saved as
// soon as it appears — no extra confirm button.
watch(emojiInput, (value) => {
  const emoji = value.trim()
  if (!isSingleEmoji(emoji)) return
  emojiInput.value = ''
  void pickEmoji(emoji)
})

function remove(): Promise<void> {
  return run(() => api.clearAvatar(props.participantId))
}

function back(): void {
  if (window.history.state?.back) router.back()
  else void router.push(`/view/${props.id}`)
}
</script>

<template>
  <div class="profile">
    <button class="back" @click="back">← Zurück</button>

    <template v-if="participant">
      <section class="hero">
        <div class="picture" :class="{ 'picture--busy': busy }">
          <img v-if="preview" :src="preview" alt="" class="preview" />
          <PlayerAvatar v-else :participant="participant" :size="200" />
        </div>
        <h1>{{ participant.name }}</h1>
        <p class="pd-muted">{{ detail?.tournament.name }}</p>
      </section>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section class="pd-panel actions">
        <h2>Foto</h2>
        <div class="photo-buttons">
          <label class="action action--primary" :class="{ disabled: busy }">
            📸 Foto aufnehmen
            <input type="file" accept="image/*" capture="user" :disabled="busy" @change="onPhoto" />
          </label>
          <label class="action" :class="{ disabled: busy }">
            🖼️ Foto hochladen
            <input type="file" accept="image/*" :disabled="busy" @change="onPhoto" />
          </label>
        </div>
      </section>

      <section class="pd-panel actions">
        <h2>Oder ein Emoji</h2>
        <div class="quick-emojis">
          <button
            v-for="emoji in AVATAR_QUICK_EMOJIS"
            :key="emoji"
            class="emoji-button"
            :class="{
              'emoji-button--active':
                participant.avatar?.kind === 'emoji' && participant.avatar.emoji === emoji,
            }"
            :disabled="busy"
            :aria-label="`Emoji ${emoji}`"
            @click="pickEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
        <input
          v-model="emojiInput"
          class="emoji-input"
          placeholder="Eigenes Emoji eintippen…"
          aria-label="Eigenes Emoji"
          autocomplete="off"
          :disabled="busy"
        />
        <p v-if="emojiHint" class="pd-muted">{{ emojiHint }}</p>
      </section>

      <button v-if="participant.avatar" class="remove" :disabled="busy" @click="remove">
        Bild entfernen
      </button>
    </template>
    <p v-else-if="detail" class="pd-muted">Diesen Spieler gibt es in diesem Turnier nicht.</p>
    <p v-else class="pd-muted">Wird geladen…</p>
  </div>
</template>

<style scoped>
.profile {
  display: grid;
  width: min(100%, 32rem);
  gap: var(--pd-space-4);
  margin: 0 auto;
}

.back {
  justify-self: start;
  min-height: 2.75rem;
}

.hero {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-2);
  text-align: center;
}

.picture {
  display: grid;
  width: 200px;
  height: 200px;
  place-items: center;
  border-radius: 50%;
  box-shadow: 0 0 48px -12px var(--pd-accent);
  transition: opacity 200ms;
}

.picture--busy {
  opacity: 0.55;
}

.preview {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

h1 {
  font-size: 1.6rem;
  overflow-wrap: anywhere;
}

h2 {
  font-size: 0.8rem;
  color: var(--pd-accent);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.actions {
  display: grid;
  gap: var(--pd-space-3);
}

.photo-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pd-space-2);
}

.action {
  display: grid;
  min-height: 3.25rem;
  place-items: center;
  padding: var(--pd-space-2);
  border: 1px solid var(--pd-border-strong);
  border-radius: var(--pd-radius);
  background: var(--pd-surface-raised);
  color: var(--pd-text);
  font-weight: 750;
  text-align: center;
  cursor: pointer;
}

.action--primary {
  border-color: var(--pd-accent);
  background: var(--pd-accent);
  color: var(--pd-accent-contrast);
}

.action.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.action input {
  display: none;
}

.quick-emojis {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--pd-space-2);
}

.emoji-button {
  min-height: 3rem;
  padding: 0;
  font-size: 1.6rem;
}

.emoji-button--active {
  border-color: var(--pd-accent);
  background: var(--pd-accent-soft);
}

.emoji-input {
  min-height: 3rem;
  font-size: 1.1rem;
}

.remove {
  min-height: 3rem;
  border-color: var(--pd-danger);
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}

.error {
  padding: var(--pd-space-2) var(--pd-space-3);
  border: 1px solid var(--pd-danger);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-danger-soft);
  color: var(--pd-danger);
}
</style>
