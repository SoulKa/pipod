// Test-only helper: wipe every table between integration tests. The schema declares no
// FK constraints, so delete order is irrelevant. Tests share one in-memory DB per file
// (see vitest.config.ts), so this gives each `it` a clean slate.
import { db } from '../db/client'
import {
  floorSessions,
  floors,
  groupMembers,
  groups,
  legs,
  matches,
  participants,
  stages,
  throws,
  tournaments,
} from '../db/schema'

export function resetDb(): void {
  db.delete(throws).run()
  db.delete(legs).run()
  db.delete(matches).run()
  db.delete(groupMembers).run()
  db.delete(groups).run()
  db.delete(stages).run()
  db.delete(floorSessions).run()
  db.delete(floors).run()
  db.delete(participants).run()
  db.delete(tournaments).run()
}
