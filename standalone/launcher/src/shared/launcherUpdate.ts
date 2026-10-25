import type { LauncherUpdateState } from './types'

/** A launcher update the user can start: one is known and not already downloading. */
export function canStartLauncherUpdate<T extends LauncherUpdateState>(
  update: T
): update is Extract<T, { status: 'available' | 'error' }> {
  return update.status === 'available' || update.status === 'error'
}
