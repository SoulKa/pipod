// A view hands its feed's participant lookups down to the components that show players,
// so a match card or table row passes an id instead of threading lookups through props.
import { inject, provide, type InjectionKey } from 'vue'
import type { Participant } from '@pipod/shared'

export interface Participants {
  participant: (id: string | null) => Participant | undefined
  /** A player's name, or a dash for a seat nobody holds yet. */
  nameOf: (id: string | null) => string
}

export const participantsKey: InjectionKey<Participants> = Symbol('participants')

export function provideParticipants(participants: Participants): void {
  provide(participantsKey, participants)
}

export function useParticipants(): Participants {
  const participants = inject(participantsKey, null)
  if (!participants) throw new Error('no participant lookup provided by an ancestor view')
  return participants
}
