import type Database from 'better-sqlite3'
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/api'
import { parseBackup, serializeBackup } from '../shared/backup'
import type { BackupFile } from '../shared/backup'
import type {
  BackupResult,
  CoachData,
  HealthInfo,
  KeyStatRow,
  LessonRow,
  MlLogInput,
  RecentKeyError,
  SaveSessionInput,
  SaveSessionResult,
  SessionSummary,
  SettingRow,
  ShadowLogRow,
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

const probability = z.number().min(0).max(1).nullable()

const logShadowSchema = z.object({
  sessionId: z.number().int().positive(),
  ruleLessonId: z.string().min(1).max(64),
  modelLessonId: z.string().min(1).max(64).nullable(),
  modelPickP: probability,
  modelRuleP: probability,
  modelVersion: z.number().int().positive(),
})

export function registerIpc(db: Database.Database, dbPath: string): void {
  ipcMain.handle(IPC.health, (): HealthInfo => {
    const row = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined
    return { dbPath, schemaVersion: row?.version ?? 0, appVersion: app.getVersion() }
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

  ipcMain.handle(IPC.logShadow, (_e, raw: unknown): void => {
    const input = logShadowSchema.parse(raw) as MlLogInput
    db.prepare(
      `INSERT INTO ml_shadow_log
         (session_id, rule_lesson_id, model_lesson_id, model_pick_p, model_rule_p, model_version)
       VALUES (@sessionId, @ruleLessonId, @modelLessonId, @modelPickP, @modelRuleP, @modelVersion)
       ON CONFLICT(session_id) DO UPDATE SET
         rule_lesson_id = excluded.rule_lesson_id,
         model_lesson_id = excluded.model_lesson_id,
         model_pick_p = excluded.model_pick_p,
         model_rule_p = excluded.model_rule_p,
         model_version = excluded.model_version`,
    ).run(input)
  })

  ipcMain.handle(IPC.getMlLog, (): ShadowLogRow[] => {
    const rows = db
      .prepare(
        `SELECT session_id, rule_lesson_id, model_lesson_id, model_pick_p, model_rule_p, model_version
         FROM ml_shadow_log ORDER BY session_id DESC LIMIT 200`,
      )
      .all() as Array<{
      session_id: number
      rule_lesson_id: string
      model_lesson_id: string | null
      model_pick_p: number | null
      model_rule_p: number | null
      model_version: number
    }>
    return rows.map((r) => ({
      sessionId: r.session_id,
      ruleLessonId: r.rule_lesson_id,
      modelLessonId: r.model_lesson_id,
      modelPickP: r.model_pick_p,
      modelRuleP: r.model_rule_p,
      modelVersion: r.model_version,
    }))
  })

  ipcMain.handle(IPC.exportBackup, async (): Promise<BackupResult> => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
        title: 'Export Beacon Type backup',
        defaultPath: `beacontype-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (canceled || filePath == null) return { ok: false, canceled: true }

      const schemaVersion = (
        db.prepare('SELECT MAX(version) v FROM schema_migrations').get() as { v: number | null }
      ).v ?? 0
      const backup: BackupFile = {
        format: 'beacontype-backup',
        backupVersion: 1,
        schemaVersion,
        exportedAt: new Date().toISOString(),
        settings: db.prepare('SELECT key, value FROM settings ORDER BY key').all() as BackupFile['settings'],
        sessions: db
          .prepare(
            `SELECT id, started_at, lesson_id, mode, net_wpm, raw_wpm, accuracy, duration_ms, formula_version
             FROM sessions ORDER BY id`,
          )
          .all() as BackupFile['sessions'],
        keystroke_events: db
          .prepare(
            'SELECT session_id, idx, expected, typed, t_ms, correct FROM keystroke_events ORDER BY session_id, idx',
          )
          .all() as BackupFile['keystroke_events'],
        key_stats: db
          .prepare(
            'SELECT key, attempts, errors, median_interval_ms, streak, updated_at FROM key_stats ORDER BY key',
          )
          .all() as BackupFile['key_stats'],
        ml_shadow_log: db
          .prepare(
            `SELECT session_id, rule_lesson_id, model_lesson_id, model_pick_p, model_rule_p, model_version
             FROM ml_shadow_log ORDER BY session_id`,
          )
          .all() as BackupFile['ml_shadow_log'],
      }
      await fs.writeFile(filePath, serializeBackup(backup), 'utf8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.importBackup, async (): Promise<BackupResult> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
        title: 'Restore Beacon Type backup',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

      const backup = parseBackup(await fs.readFile(filePaths[0], 'utf8'))

      const restore = db.transaction((b: BackupFile) => {
        // Wipe user-owned tables, then refill from the backup. Lessons and
        // user_profile stay untouched - they are app-managed.
        db.prepare('DELETE FROM keystroke_events').run()
        db.prepare('DELETE FROM key_stats').run()
        db.prepare('DELETE FROM ml_shadow_log').run()
        db.prepare('DELETE FROM sessions').run()
        db.prepare('DELETE FROM settings').run()

        const insertSession = db.prepare(
          `INSERT INTO sessions (id, started_at, lesson_id, mode, net_wpm, raw_wpm, accuracy, duration_ms, formula_version)
           VALUES (@id, @started_at, @lesson_id, @mode, @net_wpm, @raw_wpm, @accuracy, @duration_ms, @formula_version)`,
        )
        for (const s of b.sessions) insertSession.run(s)

        const insertEvent = db.prepare(
          `INSERT INTO keystroke_events (session_id, idx, expected, typed, t_ms, correct)
           VALUES (@session_id, @idx, @expected, @typed, @t_ms, @correct)`,
        )
        for (const e of b.keystroke_events) insertEvent.run(e)

        const insertStat = db.prepare(
          `INSERT INTO key_stats (key, attempts, errors, median_interval_ms, streak, updated_at)
           VALUES (@key, @attempts, @errors, @median_interval_ms, @streak, @updated_at)`,
        )
        for (const k of b.key_stats) insertStat.run(k)

        const insertShadow = db.prepare(
          `INSERT INTO ml_shadow_log (session_id, rule_lesson_id, model_lesson_id, model_pick_p, model_rule_p, model_version)
           VALUES (@session_id, @rule_lesson_id, @model_lesson_id, @model_pick_p, @model_rule_p, @model_version)`,
        )
        for (const s of b.ml_shadow_log) insertShadow.run(s)

        const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (@key, @value)')
        for (const s of b.settings) insertSetting.run(s)

        // Keep AUTOINCREMENT's counter consistent with the restored ids.
        const maxId = (db.prepare('SELECT COALESCE(MAX(id), 0) m FROM sessions').get() as { m: number }).m
        db.prepare("DELETE FROM sqlite_sequence WHERE name = 'sessions'").run()
        if (maxId > 0) {
          db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('sessions', ?)").run(maxId)
        }
      })

      restore(backup)
      return { ok: true, path: filePaths[0] }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}