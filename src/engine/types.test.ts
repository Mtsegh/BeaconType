import { describe, it, expect } from 'vitest'
import { computeMetrics, FORMULA_VERSION } from './types'
import type { TypingSession } from './types'

function session(events: Array<[number, string, string, boolean]>, durationMs: number): TypingSession {
  return {
    startedAt: 0,
    durationMs,
    passage: 'hello',
    mode: 'continue',
    events: events.map(([idx, expected, typed, correct], i) => ({ idx, expected, typed, tMs: i, correct })),
  }
}

describe('computeMetrics', () => {
  it('reports perfect runs at expected speed', () => {
    const s = session(
      [
        [0, 'h', 'h', true],
        [1, 'e', 'e', true],
        [2, 'l', 'l', true],
        [3, 'l', 'l', true],
        [4, 'o', 'o', true],
      ],
      1400,
    )
    const m = computeMetrics(s)
    expect(m.totalKeystrokes).toBe(5)
    expect(m.correctKeystrokes).toBe(5)
    expect(m.accuracy).toBe(1)
    expect(m.uncorrectedErrors).toBe(0)
    expect(m.rawWpm).toBeCloseTo(42.8571, 3)
    expect(m.netWpm).toBeCloseTo(42.8571, 3)
    expect(m.formulaVersion).toBe(FORMULA_VERSION)
  })

  it('attributes errors and reduces netWPM only', () => {
    const s = session(
      [
        [0, 'h', 'h', true],
        [1, 'e', 'y', false],
        [2, 'l', 'l', true],
        [3, 'l', 'l', true],
        [4, 'o', 'o', true],
      ],
      1400,
    )
    const m = computeMetrics(s)
    expect(m.correctKeystrokes).toBe(4)
    expect(m.uncorrectedErrors).toBe(1)
    expect(m.correctedErrors).toBe(0)
    expect(m.accuracy).toBeCloseTo(0.8, 3)
    expect(m.rawWpm).toBeCloseTo(42.8571, 3)
    expect(m.netWpm).toBeCloseTo(34.2857, 3)
  })

  it('does not divide by zero for an empty session', () => {
    const m = computeMetrics({ ...session([], 0), durationMs: 0 })
    expect(m.accuracy).toBe(0)
    expect(m.rawWpm).toBe(0)
    expect(m.netWpm).toBe(0)
  })
})