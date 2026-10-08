// SQLite access lives exclusively in the main process. The renderer never
// touches it directly - everything goes through the typed preload API.

import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'
import { migrate } from './migrations'
import type { Migration } from './migrations'

export interface AppDatabase extends Database.Database {
  pragmaFiles: () => unknown
}

let db: AppDatabase | null = null

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'beacontype.db')
}

export interface DB {
  db: Database.Database
  dbPath: string
}

export function openDb(migrations: Migration[]): DB {
  if (db) closeDb()

  const dbPath = getDbPath()
  const instance = new Database(dbPath)

  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')

  migrate(instance, migrations)

  db = instance as AppDatabase
  return { db: instance, dbPath }
}

export function closeDb(): void {
  if (!db) return
  db.close()
  db = null
}