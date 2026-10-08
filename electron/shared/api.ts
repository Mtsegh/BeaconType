// Shared contract between main, preload and renderer.
// Renderer must only ever `import type` from here - never runtime imports,
// which would drag Electron/Node code into the web bundle.

export const FORMULA_VERSION = 1 as const

export type ErrorMode = 'continue' | 'stop'

export interface KeystrokeEventRecord {
  idx: number
  expected: string
  typed: string
  tMs: number
  correct: boolean
}

export interface SaveSessionInput {
  lessonId: string
  mode: ErrorMode
  formulaVersion: number
  startedAt: number
  durationMs: number
  rawWpm: number
  netWpm: number
  accuracy: number
  correctedErrors: number
  uncorrectedErrors: number
  totalKeystrokes: number
  correctKeystrokes: number
  typedChars: number
  events: KeystrokeEventRecord[]
}

export interface KeyStatRow {
  key: string
  attempts: number
  errors: number
  medianIntervalMs: number | null
  streak: number
}

export interface SettingRow {
  key: string
  value: string
}

export interface SettingsInput {
  key: string
  value: string
}

export interface LessonRow {
  id: string
  category: string
  content: string
  targetKeys: string[]
}

export interface HealthInfo {
  dbPath: string
  schemaVersion: number
}

export interface SaveSessionResult {
  sessionId: number
  insertedEvents: number
}

export const IPC = {
  health: 'bt:health',
  listLessons: 'bt:list-lessons',
  saveSession: 'bt:save-session',
  getKeyStats: 'bt:get-key-stats',
  getSettings: 'bt:get-settings',
  setSetting: 'bt:set-setting',
} as const

export interface BTAPI {
  health(): Promise<HealthInfo>
  listLessons(): Promise<LessonRow[]>
  saveSession(input: SaveSessionInput): Promise<SaveSessionResult>
  getKeyStats(): Promise<KeyStatRow[]>
  getSettings(): Promise<SettingRow[]>
  setSetting(input: SettingsInput): Promise<SettingRow>
}