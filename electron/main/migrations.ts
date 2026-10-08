import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  sql: string[]
}

// keystroke_events is the source of truth; key_stats is a rebuildable cache.
// NEVER drop or mutate stored raw events - formulas will change, and raw
// events let us recompute history (each session stores formula_version).
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    sql: [
      `CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY,
        level TEXT NOT NULL DEFAULT 'beginner',
        layout TEXT NOT NULL DEFAULT 'qwerty',
        goals TEXT,
        daily_minutes INTEGER NOT NULL DEFAULT 10,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        lesson_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('continue','stop')),
        net_wpm REAL NOT NULL,
        raw_wpm REAL NOT NULL,
        accuracy REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        formula_version INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS keystroke_events (
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        expected TEXT NOT NULL,
        typed TEXT NOT NULL,
        t_ms INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        PRIMARY KEY (session_id, idx)
      )`,
      `CREATE TABLE IF NOT EXISTS key_stats (
        key TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        median_interval_ms REAL,
        streak INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        target_keys TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_keystroke_events_session ON keystroke_events(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at)`,
      `CREATE INDEX IF NOT EXISTS idx_lessons_category ON lessons(category)`,
    ],
  },
  {
    version: 2,
    name: 'seed-lessons',
    sql: [
      `INSERT OR IGNORE INTO lessons (id, category, content, target_keys) VALUES
        ('home-row', 'home-row', 'asdf jkl; asdf jkl; fdsa ;lkj aaa sss ddd fff jjj kkk lll sss fff jjj lll', '["a","s","d","f","j","k","l",";"]'),
        ('top-row', 'top-row', 'qwertyuiop qwertyuiop poiuy trew q asdfghjkl yuiop', '["q","w","e","r","t","y","u","i","o","p"]'),
        ('bottom-row', 'bottom-row', 'zxcvbnm zxcvbnm mnbvcxz zxc vbn asdf ghjkl zxcvbn', '["z","x","c","v","b","n","m"]'),
        ('common-words', 'words', 'the be to of and a in that have for not on with you do at this but his by from they we say', '["t","h","e","a","o","n","r","i","s","d","l","c","u","m"]')`,
    ],
  },
]

export function migrate(db: Database.Database, migrations: Migration[]): void {
  const latest = [...migrations].sort((a, b) => a.version - b.version).at(-1)
  const target = latest?.version ?? 0

  if (target > 0) {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
    ).run()
  }

  const applied = (db.prepare('SELECT version, name FROM schema_migrations').all() as Array<{ version: number }>).map(
    (r) => r.version,
  )
  const appliedSet = new Set(applied)

  const run = db.transaction(() => {
    for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
      if (appliedSet.has(m.version)) continue
      for (const sql of m.sql) db.prepare(sql).run()
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
    }
  })

  run()

  const current = (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0
  if (current !== target) {
    throw new Error(`schema migration failed: at ${current}, target ${target}`)
  }
}