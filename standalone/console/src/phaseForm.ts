// Editable phase setup for the admin console's setup step. The server's schema decides
// what is valid; this only translates its verdict and adds the checks that depend on the
// tournament itself (already running, enough players).
import { computed, reactive, watch, type Ref } from 'vue'
import {
  configurePhasesSchema,
  PHASE_SETUP_ERRORS,
  type ConfigurePhasesInput,
  type OutMode,
  type Stage,
  type StartScore,
} from '@pipod/shared'
import type { TournamentDetail } from './api'

/** The match rules every phase sets for its own matches. */
export interface PhaseRules {
  bestOf: number
  startScore: StartScore
  outMode: OutMode
}

const SETUP_ERROR_TEXT: Record<string, string> = {
  [PHASE_SETUP_ERRORS.noPhase]: 'Mindestens eine Phase muss aktiv sein.',
  [PHASE_SETUP_ERRORS.tooFewQualifiers]: 'Die K.-o.-Phase braucht mindestens zwei Qualifikanten.',
}

const defaultRules = (): PhaseRules => ({ bestOf: 3, startScore: 501, outMode: 'double' })

const rulesOf = ({ bestOf, startScore, outMode }: Stage): PhaseRules => ({
  bestOf,
  startScore,
  outMode,
})

export function usePhaseForm(detail: Ref<TournamentDetail | null>) {
  const form = reactive({
    group: { enabled: true, rules: defaultRules(), groupCount: 2 },
    knockout: { enabled: true, rules: defaultRules(), qualifiersPerGroup: 2 },
  })

  /** Load the saved setup, or the defaults for a tournament that has none yet. */
  function load(stages: Stage[]): void {
    const group = stages.find((stage) => stage.type === 'group')
    const knockout = stages.find((stage) => stage.type === 'knockout')
    form.group.enabled = !stages.length || !!group
    form.knockout.enabled = !stages.length || !!knockout
    if (group) {
      form.group.rules = rulesOf(group)
      form.group.groupCount = group.groupCount
    }
    if (knockout) {
      form.knockout.rules = rulesOf(knockout)
      // Null means "no group phase to cut", so there is no saved count to show.
      if (knockout.qualifiersPerGroup !== null) {
        form.knockout.qualifiersPerGroup = knockout.qualifiersPerGroup
      }
    }
  }

  // Saving replaces the stage rows, so their ids change exactly when the setup does. The
  // detail itself is refetched on every snapshot, which must not wipe unsaved edits.
  watch(
    () =>
      detail.value &&
      [detail.value.tournament.id, ...detail.value.stages.map((stage) => stage.id)].join(),
    () => {
      if (detail.value) load(detail.value.stages)
    },
    { immediate: true },
  )

  const input = computed<ConfigurePhasesInput>(() => ({
    group: form.group.enabled ? { ...form.group.rules, groupCount: form.group.groupCount } : null,
    knockout: form.knockout.enabled
      ? { ...form.knockout.rules, qualifiersPerGroup: form.knockout.qualifiersPerGroup }
      : null,
  }))

  /** Why the setup itself is invalid, in German; null when the server would accept it. */
  const setupError = computed(() => {
    const result = configurePhasesSchema.safeParse(input.value)
    if (result.success) return null
    const message = result.error.issues[0]?.message ?? ''
    return SETUP_ERROR_TEXT[message] ?? 'Die Phaseneinstellungen sind ungültig.'
  })

  /** Phases are fixed once the schedule exists — matches hang off them. */
  const locked = computed(() => !!detail.value?.matches.length)

  /** Why the tournament can't start yet, or null when it can. */
  const startBlocker = computed(() => {
    if (!detail.value) return null
    if (locked.value) return 'Das Turnier läuft bereits.'
    if (setupError.value) return setupError.value
    if (detail.value.participants.length < 2) return 'Es werden mindestens zwei Spieler benötigt.'
    return null
  })

  return { form, input, setupError, startBlocker, locked }
}
