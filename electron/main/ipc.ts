import type Database from 'better-sqlite3'
import { z } from 'zod'
import { ipcMain } from 'electron'
import { IPC } from '../shared/api'
import type {
  HealthInfo,
  KeyStatRow,
  LessonRow,
  SaveSessionInput,
  SaveSessionResult,
  SettingRow,
} from '../shared/api'

const MAX_EVENTS = 50_000

const eventSchema = z.object({
  idx: z.number().int().min(0),
  expected: z.string().min(1).max(8),
  typed: z.string().min(1).max(8),
  tMs: z.number().min(0),
  correct: z.boolean(),
})

const saveSessionSchema = z.object({
  lessonId: z.string().min(1).max(64),
  mode: z.enum(['continue', 'stop']),
  formulaVersion: z.number().int().positive(),
  startedAt: z.number().min(0),
  durationMs: z.number().min(0),
  rawWpm: z.number().min(0),
  netWpm: z.number().min(0),
  accuracy: z.number().min(0).max(1),
  correctedErrors: z.number().int().min(0),
  uncorrectedErrors: z.number().int().min(0),
  totalKeystrokes: z.number().int().min(0),
  correctKeystrokes: z.number().int().min(0),
  typedChars: z.number().int().min(0),
  events: z.array(eventSchema).max(MAX_EVENTS),
})

const settingsSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(1024),
})

export function registerIpc(db: Database.Database, dbPath: string): void {
  ipcMain.handle(IPC.health, (): HealthInfo => {
    const row = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined
    return { dbPath, schemaVersion: row?.version ?? 0 }
  })

  ipcMain.handle(IPC.listLessons, (): LessonRow[] => {
    const rows = db
      .prepare('SELECT id, category, content, target_keys FROM lessons ORDER BY category, id')
      .all() as Array<{ id: string; category: string; content: string; target_keys: string }>
    return rows.map((r) => ({ id: r.id, category: r.category, content: r.content, targetKeys: JSON.parse(r.target_keys) }))
  })

  ipcMain.handle(IPC.saveSession, (_e, raw: unknown): SaveSessionResult => {
    const input = saveSessionSchema.parse(raw) as SaveSessionInput

    db.prepare(
      `INSERT INTO sessions
         (started_at, lesson_id, mode, net_wpm, raw_wpm, accuracy, duration_ms, formula_version)
       VALUES (@startedAt, @lessonId, @mode, @netWpm, @rawWpm, @accuracy, @durationMs, @formulaVersion)`,
    ).run(input)

    const row = db.prepare('SELECT last_insert_rowid() AS id').get() as unknown as { id: number }
    const sessionId = Number(row.id)
    const insertEvent = db.prepare(
      `INSERT INTO keystroke_events (session_id, idx, expected, typed, t_ms, correct)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )

    const aggregate = new Map<string, { attempts: number; errors: number }>()
    const insertAll = db.transaction((events: SaveSessionInput['events']) => {
      for (const e of events) {
        insertEvent.run(sessionId, e.idx, e.expected, e.typed, e.tMs, e.correct ? 1 : 0)
        const bucket = aggregate.get(e.expected) ?? { attempts: 0, errors: 0 }
        bucket.attempts += 1
        if (!e.correct) bucket.errors += 1
        aggregate.set(e.expected, bucket)
      }
    })
    insertAll(input.events)

    const upsertKeyStat = db.prepare(
      `INSERT INTO key_stats (key, attempts, errors, updated_at)
       VALUES (@key, @attempts, @errors, @updatedAt)
       ON CONFLICT(key) DO UPDATE SET
         attempts = key_stats.attempts + excluded.attempts,
         errors = key_stats.errors + excluded.errors,
         updated_at = excluded.updated_at`,
    )
    const now = Date.now()
    const upsertAll = db.transaction(() => {
      for (const [key, { attempts, errors }] of aggregate) {
        upsertKeyStat.run({ key, attempts, errors, updatedAt: now })
      }
    })
    upsertAll()

    return { sessionId, insertedEvents: input.events.length }
  })

  ipcMain.handle(IPC.getKeyStats, (): KeyStatRow[] => {
    return db
      .prepare(
        `SELECT key, attempts, errors, median_interval_ms, streak
         FROM key_stats ORDER BY attempts DESC`,
      )
      .all() as unknown as KeyStatRow[]
  })

  ipcMain.handle(IPC.getSettings, (): SettingRow[] => {
    return db.prepare('SELECT key, value FROM settings').all() as unknown as SettingRow[]
  })

  ipcMain.handle(IPC.setSetting, (_e, raw: unknown): SettingRow => {
    const input = settingsSchema.parse(raw)
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(input)
    return db.prepare('SELECT key, value FROM settings WHERE key = ?').get(input.key) as SettingRow
  })
}