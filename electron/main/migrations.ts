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
  {
    version: 3,
    name: 'coach-lessons-and-profile',
    sql: [
      `INSERT OR IGNORE INTO user_profile (id, level, layout, daily_minutes) VALUES (1, 'beginner', 'qwerty', 10)`,
      `INSERT OR IGNORE INTO lessons (id, category, content, target_keys) VALUES
        ('punctuation', 'punctuation', 'wait, what? really! all fine; ok (yes) [done] 50% sure, 100% done: stop. go, run, jump - now!', '[".", ",", "?", "!", ";", "(", ")", "[", "]", "%", ":", "-"]'),
        ('numbers', 'numbers', '12345 67890 11223 34455 3.14 42 100 50% 25 75 9:15 6/7/8 2026 80 90', '["0","1","2","3","4","5","6","7","8","9"]'),
        ('drills', 'drills', 'the and ing her ere tion ment want call each work first like time good made very more long much place still every night end great mind behind send hand hard word kind', '["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"]'),
        ('passage-lighthouse', 'passages', 'the beacon turns once every hour, sweeping the dark water with a slow white arm. boats keep their distance and the gulls never settle on the tower.', '["a","b","c","d","e","f","g","h","i","k","l","m","n","o","p","r","s","t","u","w","y"]'),
        ('passage-hands', 'passages', 'keep your wrists level and your eyes on the line. speed arrives later, on its own, when the hands stop thinking about the keys.', '["a","b","c","d","e","f","g","h","i","k","l","m","n","o","p","r","s","t","u","v","w","x","y"]')`,
    ],
  },
  {
    version: 4,
    name: 'diagnostic-lesson',
    sql: [
      // ~140 chars: every letter a-z, digits 0-7, and basic punctuation in
      // roughly one minute — used by first-run onboarding.
      `INSERT OR IGNORE INTO lessons (id, category, content, target_keys) VALUES
        ('diagnostic', 'diagnostic', 'fast hands follow a steady mind. jab the van, mix the cog, fix 45 keys. type slowly: 6 lamps, 7 zones, quiz 10 20 30. keep your wrists level.', '["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","0","1","2","3","4","5","6","7",".",",",":"]')`,
    ],
  },
  {
    version: 5,
    name: 'ml-shadow-log',
    sql: [
      // One row per saved session: what each coach would have picked next to
      // what actually happened. Outcome is resolved at read time from the
      // FOLLOWING session, so nothing here can go stale.
      `CREATE TABLE IF NOT EXISTS ml_shadow_log (
        session_id INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        rule_lesson_id TEXT NOT NULL,
        model_lesson_id TEXT,
        model_pick_p REAL,
        model_rule_p REAL,
        model_version INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 6,
    name: 'lesson-content-honesty',
    sql: [
      // A few lessons listed target_keys their content never used (f, b, c,
      // m, x, q, z, comma). Extend the texts instead of shrinking the
      // promises - the honesty test in migrations.test.ts guards this forever.
      `UPDATE lessons SET content = content || ' quiz jazz vex fox quick jumps' WHERE id = 'drills'`,
      `UPDATE lessons SET content = content || ' can will' WHERE id = 'common-words'`,
      `UPDATE lessons SET content = 'the beacon turns once every hour, sweeping the dark water with a slow white arm as the fog drifts by. boats keep their distance and the gulls never settle on the tower.' WHERE id = 'passage-lighthouse'`,
      `UPDATE lessons SET content = 'keep your wrists level and your eyes on the line. the fingers curve, the back is straight, and each hand stays calm; the fix is slow, and speed arrives later on its own.' WHERE id = 'passage-hands'`,
      `UPDATE lessons SET content = 'fast hands follow a steady mind. jab the van, mix the cog, fix 45 keys, type slowly: 6 lamps, 7 zones, quiz 10 20 30. keep your wrists level.' WHERE id = 'diagnostic'`,
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