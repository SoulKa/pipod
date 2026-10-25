// Test-only builders for phase setups, so a suite only spells out the setting it is about.
import type { ConfigurePhasesInput, GroupPhaseInput, KnockoutPhaseInput } from '@pipod/shared'

export const groupPhase = (over: Partial<GroupPhaseInput> = {}): GroupPhaseInput => ({
  bestOf: 1,
  startScore: 501,
  outMode: 'double',
  groupCount: 1,
  ...over,
})

export const knockoutPhase = (over: Partial<KnockoutPhaseInput> = {}): KnockoutPhaseInput => ({
  bestOf: 1,
  startScore: 501,
  outMode: 'double',
  qualifiersPerGroup: 2,
  ...over,
})

/** A group-only setup. */
export const groupOnly = (over: Partial<GroupPhaseInput> = {}): ConfigurePhasesInput => ({
  group: groupPhase(over),
  knockout: null,
})

/** A knockout-only setup. */
export const knockoutOnly = (over: Partial<KnockoutPhaseInput> = {}): ConfigurePhasesInput => ({
  group: null,
  knockout: knockoutPhase(over),
})

/** Both phases with default settings, overridable per phase. */
export const groupThenKnockout = (
  group: Partial<GroupPhaseInput> = {},
  knockout: Partial<KnockoutPhaseInput> = {},
): ConfigurePhasesInput => ({ group: groupPhase(group), knockout: knockoutPhase(knockout) })
