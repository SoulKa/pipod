<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import VirtualKeyboard from './VirtualKeyboard.vue'
import { activeKeyboard, claimKeyboard, releaseKeyboard } from './activeKeyboard'

// The wrapper only owns keyboard plumbing; every other attribute (classes, aria-*, autocomplete)
// falls through to the real <input> so each app keeps its own field styling.
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })
// Optional `v-model:open` lets a parent dismiss the keyboard programmatically — e.g. the
// dashboard's SearchSelect closes it once a result is picked.
const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    maxlength?: number
    doneLabel?: string
    type?: 'text' | 'search'
  }>(),
  { label: '', placeholder: '', maxlength: 40, doneLabel: '✓', type: 'text' },
)

// The panel repeats the value being typed, so it needs a heading of its own when the field's
// label is off-screen behind the keyboard.
const kbLabel = computed(() => props.label || props.placeholder)

const inputEl = ref<HTMLInputElement | null>(null)
const owner = Symbol('touch-text-input')
const active = activeKeyboard()

function show() {
  claimKeyboard(owner)
  open.value = true
}

function hide() {
  releaseKeyboard(owner)
  open.value = false
}

function onNativeInput(event: Event) {
  // A USB keyboard still types straight into the field (handy in `yarn dev:*` on a laptop).
  model.value = (event.target as HTMLInputElement).value
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

// Another field claiming the keyboard closes this one.
watch(active, (current) => {
  if (current !== owner) open.value = false
})

watch(open, async (isOpen) => {
  if (!isOpen) {
    document.removeEventListener('keydown', onDocumentKeydown)
    releaseKeyboard(owner)
    return
  }
  claimKeyboard(owner)
  document.addEventListener('keydown', onDocumentKeydown)
  await nextTick()
  // The panel covers the bottom of the viewport — scroll the field back into sight.
  inputEl.value?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  releaseKeyboard(owner)
})
</script>

<template>
  <input
    ref="inputEl"
    v-bind="$attrs"
    :value="model"
    :type="type"
    :placeholder="placeholder"
    :maxlength="maxlength"
    inputmode="none"
    @input="onNativeInput"
    @focus="show"
    @click="show"
  />

  <Teleport to="body">
    <VirtualKeyboard
      v-if="open"
      v-model="model"
      :label="kbLabel"
      :maxlength="maxlength"
      :done-label="doneLabel"
      @close="hide"
    />
  </Teleport>
</template>
