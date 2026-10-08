// UI settings: persisted as plain string rows in the `settings` table.
// Parsing is defensive — an unknown or corrupt value falls back to the
// default instead of breaking the screen.

import type { SettingRow } from '../../electron/shared/api'

export type KeyboardMode = 'always' | 'fade' | 'no-peek'
export type FontSize = 'sm' | 'md' | 'lg'

export interface UISettings {
  sound: boolean
  voice: boolean
  reducedMotion: boolean
  keyboardMode: KeyboardMode
  fontSize: FontSize
}

export const DEFAULT_SETTINGS: UISettings = {
  sound: true,
  voice: false,
  reducedMotion: false,
  keyboardMode: 'always',
  fontSize: 'md',
}

export const SETTING_KEYS: Record<keyof UISettings, string> = {
  sound: 'ui.sound',
  voice: 'ui.voice',
  reducedMotion: 'ui.reducedMotion',
  keyboardMode: 'ui.keyboardMode',
  fontSize: 'ui.fontSize',
}

export const ONBOARDED_KEY = 'ui.onboarded'

const KEYBOARD_MODES: KeyboardMode[] = ['always', 'fade', 'no-peek']
const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg']

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function parseEnum<T extends string>(value: string | undefined, allowed: T[], fallback: T): T {
  return value !== undefined && (allowed as string[]).includes(value) ? (value as T) : fallback
}

export function loadSettings(rows: SettingRow[]): UISettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  return {
    sound: parseBool(byKey.get(SETTING_KEYS.sound), DEFAULT_SETTINGS.sound),
    voice: parseBool(byKey.get(SETTING_KEYS.voice), DEFAULT_SETTINGS.voice),
    reducedMotion: parseBool(byKey.get(SETTING_KEYS.reducedMotion), DEFAULT_SETTINGS.reducedMotion),
    keyboardMode: parseEnum(byKey.get(SETTING_KEYS.keyboardMode), KEYBOARD_MODES, DEFAULT_SETTINGS.keyboardMode),
    fontSize: parseEnum(byKey.get(SETTING_KEYS.fontSize), FONT_SIZES, DEFAULT_SETTINGS.fontSize),
  }
}

/** Rows to write for a settings object (round-trips through loadSettings). */
export function settingEntries(s: UISettings): { key: string; value: string }[] {
  return (Object.keys(SETTING_KEYS) as (keyof UISettings)[]).map((field) => ({
    key: SETTING_KEYS[field],
    value: String(s[field]),
  }))
}

export function isOnboarded(rows: SettingRow[]): boolean {
  return rows.find((r) => r.key === ONBOARDED_KEY)?.value === 'true'
}
