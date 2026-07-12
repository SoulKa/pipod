import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { dbPath, env } from '../env'
import * as schema from './schema'

/**
 * Open the SQLite database and apply the generated schema migrations. WAL keeps
 * reads (overview screens) from blocking writes (live throws).
 */
function createDb() {
  if (dbPath !== ':memory:') mkdirSync(env.dataDir, { recursive: true })
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  return db
}

export const db = createDb()
export type Db = typeof db
