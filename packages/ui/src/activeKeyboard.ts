import { shallowRef } from 'vue'

// Only one on-screen keyboard may be open at a time: the panel is fixed to the bottom of the
// screen, so two open panels would stack on top of each other. Each TouchTextInput claims this
// module-level slot when it opens and closes itself when another input claims it.
const activeOwner = shallowRef<symbol | null>(null)

export function claimKeyboard(owner: symbol): void {
  activeOwner.value = owner
}

export function releaseKeyboard(owner: symbol): void {
  if (activeOwner.value === owner) activeOwner.value = null
}

export function activeKeyboard() {
  return activeOwner
}
