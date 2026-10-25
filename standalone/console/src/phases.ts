// Phase vocabulary shared by the admin console and the viewer. Phases have fixed names,
// derived from their type, and a fixed order: group phase first, knockout second.
import type { OutMode, StageType } from '@pipod/shared'

const PHASE_LABELS: Record<StageType, string> = {
  group: 'Gruppenphase',
  knockout: 'K.-o.-Phase',
}

export const phaseLabel = (type: StageType): string => PHASE_LABELS[type] ?? type

const OUT_MODE_LABELS: Record<OutMode, string> = {
  single: 'Single-Out',
  double: 'Double-Out',
}

export const outModeLabel = (mode: OutMode): string => OUT_MODE_LABELS[mode] ?? mode
