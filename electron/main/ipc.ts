import type Database from 'better-sqlite3'
import { z } from 'zod'
import { ipcMain } from 'electron'
import { IPC } from '../shared/api'
import type {
  CoachData,
  HealthInfo,
  KeyStatRow,
  LessonRow,
  RecentKeyError,
  SaveSessionInput,
  SaveSessionResult,
  SessionSummary,
  SettingRow,
} from '../shared/api'

const MAX_EVENTS = 50_000

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

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

    const ordered = [...input.events].sort((a, b) => a.idx - b.idx)
    const intervalsByKey = new Map<string, number[]>()
    const streakByKey = new Map<string, number>()
    const aggregate = new Map<string, { attempts: number; errors: number }>()

    const insertAll = db.transaction((events: SaveSessionInput['events']) => {
      for (const e of events) {
        insertEvent.run(sessionId, e.idx, e.expected, e.typed, e.tMs, e.correct ? 1 : 0)
      }
      // Session-level per-key rollup for the key_stats cache: same math as
      // the renderer engine (interval only recorded when the CURRENT
      // keystroke is correct, measured from the previous keystroke).
      for (let i = 0; i < ordered.length; i++) {
        const e = ordered[i]
        const bucket = aggregate.get(e.expected) ?? { attempts: 0, errors: 0 }
        bucket.attempts += 1
        if (e.correct) {
          if (i > 0) {
            const intervals = intervalsByKey.get(e.expected) ?? []
            intervals.push(e.tMs - ordered[i - 1].tMs)
            intervalsByKey.set(e.expected, intervals)
          }
          streakByKey.set(e.expected, (streakByKey.get(e.expected) ?? 0) + 1)
        } else {
          bucket.errors += 1
          streakByKey.set(e.expected, 0)
        }
        aggregate.set(e.expected, bucket)
      }
    })
    insertAll(input.events)

    const upsertKeyStat = db.prepare(
      `INSERT INTO key_stats (key, attempts, errors, median_interval_ms, streak, updated_at)
       VALUES (@key, @attempts, @errors, @medianIntervalMs, @streak, @updatedAt)
       ON CONFLICT(key) DO UPDATE SET
         attempts = key_stats.attempts + excluded.attempts,
         errors = key_stats.errors + excluded.errors,
         median_interval_ms = COALESCE(excluded.median_interval_ms, key_stats.median_interval_ms),
         streak = excluded.streak,
         updated_at = excluded.updated_at`,
    )
    const now = Date.now()
    const upsertAll = db.transaction(() => {
      for (const [key, { attempts, errors }] of aggregate) {
        const intervals = intervalsByKey.get(key) ?? []
        upsertKeyStat.run({
          key,
          attempts,
          errors,
          // A 1-2 sample median is noise; keep the previous signal instead.
          medianIntervalMs: intervals.length >= 3 ? median(intervals) : null,
          streak: streakByKey.get(key) ?? 0,
          updatedAt: now,
        })
      }
    })
    upsertAll()

    return { sessionId, insertedEvents: input.events.length }
  })

  ipcMain.handle(IPC.getKeyStats, (): KeyStatRow[] => {
    const rows = db
      .prepare(
        `SELECT key, attempts, errors, median_interval_ms, streak
         FROM key_stats ORDER BY attempts DESC`,
      )
      .all() as Array<{ key: string; attempts: number; errors: number; median_interval_ms: number | null; streak: number }>
    return rows.map((r) => ({
      key: r.key,
      attempts: r.attempts,
      errors: r.errors,
      medianIntervalMs: r.median_interval_ms,
      streak: r.streak,
    }))
  })

  ipcMain.handle(IPC.getCoach, (): CoachData => {
    const statRows = db
      .prepare(
        `SELECT key, attempts, errors, median_interval_ms, streak
         FROM key_stats ORDER BY attempts DESC`,
      )
      .all() as Array<{ key: string; attempts: number; errors: number; median_interval_ms: number | null; streak: number }>
    const keyStats = statRows.map((r) => ({
      key: r.key,
      attempts: r.attempts,
      errors: r.errors,
      medianIntervalMs: r.median_interval_ms,
      streak: r.streak,
    }))

    const sessionRows = db
      .prepare(
        `SELECT id, started_at, lesson_id, net_wpm, accuracy, duration_ms
         FROM sessions ORDER BY started_at DESC LIMIT 30`,
      )
      .all() as Array<{ id: number; started_at: number; lesson_id: string; net_wpm: number; accuracy: number; duration_ms: number }>
    const sessions: SessionSummary[] = sessionRows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      lessonId: r.lesson_id,
      netWpm: r.net_wpm,
      accuracy: r.accuracy,
      durationMs: r.duration_ms,
    }))

    // Per-key error breakdown of the newest sessions for the recent_k term.
    const ageBySession = new Map(sessions.slice(0, 10).map((s, i) => [s.id, i]))
    const grouped = db
      .prepare(
        `SELECT session_id, expected AS key, COUNT(*) AS attempts,
                SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) AS errors
         FROM keystroke_events
         WHERE session_id IN (SELECT id FROM sessions ORDER BY started_at DESC LIMIT 10)
         GROUP BY session_id, expected`,
      )
      .all() as Array<{ session_id: number; key: string; attempts: number; errors: number }>
    const recentKeyErrors: RecentKeyError[] = grouped.map((g) => ({
      key: g.key,
      attempts: g.attempts,
      errors: g.errors,
      age: ageBySession.get(g.session_id) ?? 0,
    }))

    // The user's overall median interval: every interval after a correct
    // keystroke across recent sessions, bounded so huge histories stay fast.
    const intervalRows = db
      .prepare(
        `WITH ev AS (
           SELECT t_ms, correct,
                  LAG(t_ms) OVER (PARTITION BY session_id ORDER BY idx) AS prev
           FROM keystroke_events
           WHERE session_id IN (SELECT id FROM sessions ORDER BY started_at DESC LIMIT 20)
         )
         SELECT t_ms - prev AS d FROM ev
         WHERE correct = 1 AND prev IS NOT NULL AND t_ms - prev > 0
         LIMIT 20000`,
      )
      .all() as Array<{ d: number }>
    const userMedianIntervalMs = median(intervalRows.map((r) => r.d))

    const profile = db.prepare('SELECT daily_minutes FROM user_profile WHERE id = 1').get() as
      | { daily_minutes: number }
      | undefined
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const today = db
      .prepare('SELECT COALESCE(SUM(duration_ms), 0) AS ms FROM sessions WHERE started_at >= ?')
      .get(dayStart.getTime()) as { ms: number }

    return {
      keyStats,
      userMedianIntervalMs,
      sessions,
      recentKeyErrors,
      dailyGoalMinutes: profile?.daily_minutes ?? 10,
      todayPracticeMs: today.ms,
    }
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