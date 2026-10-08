import { describe, expect, it } from 'vitest'
import { deriveAchievements } from './achievements'
import type { SessionSummary } from '../../electron/shared/api'

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 1,
    startedAt: 1_700_000_000_000,
    lessonId: 'home-row',
    netWpm: 25,
    accuracy: 0.9,
    durationMs: 60_000,
    ...overrides,
  }
}

describe('deriveAchievements', () => {
  it('locks everything for a brand-new account', () => {
    const all = deriveAchievements([])
    expect(all).toHaveLength(6)
    expect(all.every((a) => !a.earned)).toBe(true)
  })

  it('earns First transmission after one session', () => {
    const first = deriveAchievements([session()]).find((a) => a.id === 'first-transmission')
    expect(first?.earned).toBe(true)
  })

  it('earns Regular signal at five sessions, not four', () => {
    const four = deriveAchievements(Array.from({ length: 4 }, () => session()))
    expect(four.find((a) => a.id === 'five-sessions')?.earned).toBe(false)
    const five = deriveAchievements(Array.from({ length: 5 }, () => session()))
    expect(five.find((a) => a.id === 'five-sessions')?.earned).toBe(true)
  })

  it('earns Sharpshooter at 95% accuracy and not below', () => {
    expect(deriveAchievements([session({ accuracy: 0.95 })]).find((a) => a.id === 'sharpshooter')?.earned).toBe(true)
    expect(deriveAchievements([session({ accuracy: 0.949 })]).find((a) => a.id === 'sharpshooter')?.earned).toBe(false)
  })

  it('earns Steady hands at 40 net WPM', () => {
    expect(deriveAchievements([session({ netWpm: 40 })]).find((a) => a.id === 'steady-hands')?.earned).toBe(true)
    expect(deriveAchievements([session({ netWpm: 39.9 })]).find((a) => a.id === 'steady-hands')?.earned).toBe(false)
  })

  it('earns Explorer across five distinct lessons', () => {
    const lessons = ['a', 'b', 'c', 'd'].map((id) => session({ lessonId: id }))
    expect(deriveAchievements(lessons).find((a) => a.id === 'explorer')?.earned).toBe(false)
    expect(deriveAchievements([...lessons, session({ lessonId: 'e' })]).find((a) => a.id === 'explorer')?.earned).toBe(true)
    expect(deriveAchievements([...lessons, session({ lessonId: 'a' })]).find((a) => a.id === 'explorer')?.earned).toBe(false)
  })

  it('earns Deep focus at five minutes of one session', () => {
    expect(deriveAchievements([session({ durationMs: 300_000 })]).find((a) => a.id === 'deep-focus')?.earned).toBe(true)
    expect(deriveAchievements([session({ durationMs: 299_999 })]).find((a) => a.id === 'deep-focus')?.earned).toBe(false)
  })
})
