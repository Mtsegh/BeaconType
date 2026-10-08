// Backup file format: a full-fidelity export of every user-owned table.
// Hand-rolled validation (no zod) keeps this module dependency-free so both
// the main process and the sandboxed preload bundle stay lean. Lessons and
// user_profile are intentionally NOT exported - lessons are re-seeded by
// migrations and profile is app-managed state.

export const BACKUP_FORMAT = 'beacontype-backup'
export const BACKUP_VERSION = 1

export interface BackupSettingRow {
  key: string
  value: string
}

export interface BackupSessionRow {
  id: number
  started_at: number
  lesson_id: string
  mode: 'continue' | 'stop'
  net_wpm: number
  raw_wpm: number
  accuracy: number
  duration_ms: number
  formula_version: number
}

export interface BackupEventRow {
  session_id: number
  idx: number
  expected: string
  typed: string
  t_ms: number
  correct: number
}

export interface BackupKeyStatRow {
  key: string
  attempts: number
  errors: number
  median_interval_ms: number | null
  streak: number
  updated_at: number
}

export interface BackupShadowRow {
  session_id: number
  rule_lesson_id: string
  model_lesson_id: string | null
  model_pick_p: number | null
  model_rule_p: number | null
  model_version: number
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  backupVersion: number
  schemaVersion: number
  exportedAt: string
  settings: BackupSettingRow[]
  sessions: BackupSessionRow[]
  keystroke_events: BackupEventRow[]
  key_stats: BackupKeyStatRow[]
  ml_shadow_log: BackupShadowRow[]
}

type FieldKind = 'string' | 'number' | 'nullableString' | 'nullableNumber'

function validateRows(name: string, value: unknown, fields: Record<string, FieldKind>): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`backup section "${name}" must be an array`)
  }
  for (const row of value) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`backup section "${name}" contains a non-object row`)
    }
    for (const [field, kind] of Object.entries(fields)) {
      const v = (row as Record<string, unknown>)[field]
      const ok =
        kind === 'string'
          ? typeof v === 'string'
          : kind === 'number'
            ? typeof v === 'number' && Number.isFinite(v)
            : kind === 'nullableString'
              ? v === null || typeof v === 'string'
              : v === null || (typeof v === 'number' && Number.isFinite(v))
      if (!ok) {
        throw new Error(`backup row in "${name}" has an invalid "${field}" value`)
      }
    }
  }
  return value
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('backup file is not valid JSON')
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('backup file must be a JSON object')
  }
  const data = raw as Record<string, unknown>
  if (data.format !== BACKUP_FORMAT) {
    throw new Error('not a Beacon Type backup file')
  }
  if (typeof data.backupVersion !== 'number' || data.backupVersion > BACKUP_VERSION) {
    throw new Error('backup was made by a newer version of Beacon Type')
  }
  if (typeof data.schemaVersion !== 'number' || !Number.isFinite(data.schemaVersion)) {
    throw new Error('backup is missing its schema version')
  }
  if (typeof data.exportedAt !== 'string') {
    throw new Error('backup is missing its export timestamp')
  }

  return {
    format: BACKUP_FORMAT,
    backupVersion: data.backupVersion,
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    settings: validateRows('settings', data.settings, { key: 'string', value: 'string' }) as BackupSettingRow[],
    sessions: validateRows('sessions', data.sessions, {
      id: 'number',
      started_at: 'number',
      lesson_id: 'string',
      mode: 'string',
      net_wpm: 'number',
      raw_wpm: 'number',
      accuracy: 'number',
      duration_ms: 'number',
      formula_version: 'number',
    }) as BackupSessionRow[],
    keystroke_events: validateRows('keystroke_events', data.keystroke_events, {
      session_id: 'number',
      idx: 'number',
      expected: 'string',
      typed: 'string',
      t_ms: 'number',
      correct: 'number',
    }) as BackupEventRow[],
    key_stats: validateRows('key_stats', data.key_stats, {
      key: 'string',
      attempts: 'number',
      errors: 'number',
      median_interval_ms: 'nullableNumber',
      streak: 'number',
      updated_at: 'number',
    }) as BackupKeyStatRow[],
    ml_shadow_log: validateRows('ml_shadow_log', data.ml_shadow_log, {
      session_id: 'number',
      rule_lesson_id: 'string',
      model_lesson_id: 'nullableString',
      model_pick_p: 'nullableNumber',
      model_rule_p: 'nullableNumber',
      model_version: 'number',
    }) as BackupShadowRow[],
  }
}

export function serializeBackup(backup: BackupFile): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}
