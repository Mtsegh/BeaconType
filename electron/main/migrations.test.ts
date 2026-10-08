import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from './migrations'
import Database from 'better-sqlite3'

function freshDb(): Database.Database {
  return new Database(':memory:')
}

const USER_TABLES = ['sessions', 'keystroke_events', 'key_stats', 'settings', 'ml_shadow_log']

describe('migrations', () => {
  it('has unique, positive, strictly increasing versions', () => {
    const versions = MIGRATIONS.map((m) => m.version)
    expect(versions).toEqual([...versions].sort((a, b) => a - b))
    expect(new Set(versions).size).toBe(versions.length)
    expect(versions.every((v) => v > 0)).toBe(true)
    for (const m of MIGRATIONS) expect(m.name).toBeTruthy()
  })

  it('applies every migration on a fresh database', () => {
    const db = freshDb()
    migrate(db, MIGRATIONS)

    const applied = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r) => (r as { version: number }).version)
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version))

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of [...USER_TABLES, 'lessons', 'user_profile', 'schema_migrations']) {
      expect(tables).toContain(t)
    }

    expect((db.prepare('SELECT COUNT(*) c FROM lessons').get() as { c: number }).c).toBe(10)
    expect(
      (db.prepare("SELECT COUNT(*) c FROM lessons WHERE id='diagnostic'").get() as { c: number }).c,
    ).toBe(1)
  })

  it('upgrades an existing v4 database in place without losing data', () => {
    const db = freshDb()
    migrate(db, MIGRATIONS.slice(0, 4))
    db.prepare(
      `INSERT INTO sessions (started_at, lesson_id, mode, net_wpm, raw_wpm, accuracy, duration_ms, formula_version)
       VALUES (1000, 'home-row', 'continue', 40, 45, 0.95, 60000, 1)`,
    ).run()
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('ui.onboarded', 'true')

    migrate(db, MIGRATIONS)

    expect(
      (db.prepare('SELECT COUNT(*) c FROM sessions').get() as { c: number }).c,
    ).toBe(1)
    expect(
      (db.prepare("SELECT value FROM settings WHERE key='ui.onboarded'").get() as { value: string }).value,
    ).toBe('true')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='ml_shadow_log'").get()).toBeTruthy()
  })

  it('is idempotent - a second run applies nothing and changes nothing', () => {
    const db = freshDb()
    migrate(db, MIGRATIONS)
    const first = db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all()
    migrate(db, MIGRATIONS)
    const second = db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all()
    expect(second).toEqual(first)
  })

  it('keeps every lesson target_keys honest - only chars present in the content', () => {
    const db = freshDb()
    migrate(db, MIGRATIONS)
    const lessons = db.prepare('SELECT id, content, target_keys FROM lessons').all() as Array<{
      id: string
      content: string
      target_keys: string
    }>
    for (const lesson of lessons) {
      const keys = JSON.parse(lesson.target_keys) as string[]
      for (const k of keys) {
        expect(
          lesson.content.includes(k),
          `lesson "${lesson.id}" claims target key "${k}" but the content never uses it`,
        ).toBe(true)
      }
    }
  })
})
