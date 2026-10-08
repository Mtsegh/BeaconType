import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isOnboarded, loadSettings, settingEntries } from './settings'

describe('loadSettings', () => {
  it('returns defaults for an empty settings table', () => {
    expect(loadSettings([])).toEqual(DEFAULT_SETTINGS)
  })

  it('reads stored values', () => {
    const rows = [
      { key: 'ui.sound', value: 'false' },
      { key: 'ui.voice', value: 'true' },
      { key: 'ui.reducedMotion', value: 'true' },
      { key: 'ui.keyboardMode', value: 'no-peek' },
      { key: 'ui.fontSize', value: 'lg' },
    ]
    expect(loadSettings(rows)).toEqual({
      sound: false,
      voice: true,
      reducedMotion: true,
      keyboardMode: 'no-peek',
      fontSize: 'lg',
    })
  })

  it('falls back to defaults on corrupt or unknown values', () => {
    const rows = [
      { key: 'ui.sound', value: 'yes' },
      { key: 'ui.keyboardMode', value: 'sometimes' },
      { key: 'ui.fontSize', value: 'huge' },
    ]
    expect(loadSettings(rows)).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips through settingEntries', () => {
    const settings = {
      sound: false,
      voice: true,
      reducedMotion: true,
      keyboardMode: 'fade' as const,
      fontSize: 'sm' as const,
    }
    expect(loadSettings(settingEntries(settings))).toEqual(settings)
  })
})

describe('isOnboarded', () => {
  it('is false when the flag is missing or not "true"', () => {
    expect(isOnboarded([])).toBe(false)
    expect(isOnboarded([{ key: 'ui.onboarded', value: 'false' }])).toBe(false)
  })

  it('is true only for an explicit "true"', () => {
    expect(isOnboarded([{ key: 'ui.onboarded', value: 'true' }])).toBe(true)
  })
})
