import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup, serializeBackup } from './backup'
import type { BackupFile } from './backup'

function sample(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: 6,
    exportedAt: '2026-10-08T19:00:00.000Z',
    settings: [{ key: 'ui.sound', value: 'false' }],
    sessions: [
      {
        id: 1,
        started_at: 1000,
        lesson_id: 'home-row',
        mode: 'continue',
        net_wpm: 40,
        raw_wpm: 45,
        accuracy: 0.95,
        duration_ms: 60000,
        formula_version: 1,
      },
    ],
    keystroke_events: [{ session_id: 1, idx: 0, expected: 'a', typed: 'a', t_ms: 120, correct: 1 }],
    key_stats: [{ key: 'a', attempts: 10, errors: 1, median_interval_ms: 130, streak: 4, updated_at: 2000 }],
    ml_shadow_log: [
      {
        session_id: 1,
        rule_lesson_id: 'top-row',
        model_lesson_id: null,
        model_pick_p: null,
        model_rule_p: null,
        model_version: 1,
      },
    ],
    ...overrides,
  }
}

describe('backup format', () => {
  it('round-trips through serialize/parse', () => {
    const original = sample()
    expect(parseBackup(serializeBackup(original))).toEqual(original)
  })

  it('keeps nullable fields nullable', () => {
    const parsed = parseBackup(serializeBackup(sample()))
    expect(parsed.key_stats[0].median_interval_ms).toBe(130)
    expect(parsed.ml_shadow_log[0].model_pick_p).toBeNull()
  })

  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON')
  })

  it('rejects foreign JSON objects', () => {
    expect(() => parseBackup('{"format":"something-else"}')).toThrow('not a Beacon Type backup')
    expect(() => parseBackup('[]')).toThrow('JSON object')
  })

  it('rejects backups from a newer version', () => {
    expect(() => parseBackup(JSON.stringify(sample({ backupVersion: BACKUP_VERSION + 1 })))).toThrow(
      'newer version',
    )
  })

  it('rejects missing schema metadata', () => {
    const b = sample() as unknown as Record<string, unknown>
    delete b.schemaVersion
    expect(() => parseBackup(JSON.stringify(b))).toThrow('schema version')
  })

  it('rejects rows with invalid field types', () => {
    const bad = sample()
    // @ts-expect-error deliberately corrupt row
    bad.sessions[0].net_wpm = 'fast'
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('"net_wpm"')
  })

  it('rejects non-array sections', () => {
    const bad = JSON.parse(serializeBackup(sample())) as Record<string, unknown>
    bad.settings = { key: 'x' }
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('"settings" must be an array')
  })

  it('accepts null in nullable columns', () => {
    const b = sample()
    b.key_stats[0].median_interval_ms = null
    b.ml_shadow_log[0].model_lesson_id = null
    expect(() => parseBackup(JSON.stringify(b))).not.toThrow()
  })
})
