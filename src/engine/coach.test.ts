import { describe, it, expect } from 'vitest'
import {
  COACH_CONFIG,
  computeWeakness,
  formatKeys,
  recommend,
  rollingAccuracy,
  shouldSuggestSlowDown,
} from './coach'
import type { CoachSnapshot, KeyEvidence, RecentSample } from './coach'
import type { TypingEvent } from './types'

function evidence(overrides: Partial<KeyEvidence> & { key: string }): KeyEvidence {
  return { attempts: 0, errors: 0, medianIntervalMs: null, streak: 0, ...overrides }
}

const snapshot = (over: Partial<CoachSnapshot>): CoachSnapshot => ({
  keyStats: [],
  recent: [],
  userMedianIntervalMs: null,
  ...over,
})

describe('computeWeakness - smoothing and scaling', () => {
  it('smooths a tiny sample toward the prior instead of the raw error rate', () => {
    // raw rate would be 50%; smoothing gives (1+1)/(2+20) = 9.1%
    const [row] = computeWeakness([evidence({ key: 'q', attempts: 2, errors: 1 })], [], null)
    const expectedRate = (1 + 1) / (2 + 20)
    expect(row.err).toBeCloseTo(Math.min(expectedRate / COACH_CONFIG.errScale, 1), 10)
    expect(row.err).toBeLessThan(0.5)
  })

  it('caps the scaled error term at 1', () => {
    const [row] = computeWeakness([evidence({ key: 'x', attempts: 20, errors: 15 })], [], null)
    expect(row.err).toBe(1)
  })

  it('weights the terms exactly as configured', () => {
    const keyStats = [evidence({ key: 'r', attempts: 40, errors: 8, medianIntervalMs: 300 })]
    const recent: RecentSample[] = [{ key: 'r', attempts: 10, errors: 3, age: 0 }]
    const [row] = computeWeakness(keyStats, recent, 200)
    // errorRate 9/60 = 0.15 -> 0.15/0.25 = 0.6; 300/200-1 = 0.5; recent 3/10 capped at 1
    expect(row.err).toBeCloseTo(0.6, 10)
    expect(row.slow).toBeCloseTo(0.5, 10)
    expect(row.recent).toBe(1)
    const manual = 0.55 * 0.6 + 0.25 * 0.5 + 0.2 * 1
    expect(row.weakness).toBeCloseTo(manual, 10)
    expect(COACH_CONFIG.weights.err + COACH_CONFIG.weights.slow + COACH_CONFIG.weights.recent).toBeCloseTo(1, 10)
  })

  it('treats no history as zero weakness contributions, not undefined', () => {
    const [row] = computeWeakness([evidence({ key: 'z', attempts: 0, errors: 0 })], [], null)
    expect(Number.isFinite(row.weakness)).toBe(true)
    expect(row.recent).toBe(0)
    expect(row.slow).toBe(0)
  })
})

describe('computeWeakness - slow term', () => {
  it('clamps the median ratio above the user median into 0..1', () => {
    const stats = [
      evidence({ key: 'a', attempts: 50, errors: 0, medianIntervalMs: 400 }), // 2x user median
      evidence({ key: 'b', attempts: 50, errors: 0, medianIntervalMs: 220 }), // 1.1x
      evidence({ key: 'c', attempts: 50, errors: 0, medianIntervalMs: 150 }), // faster than user
    ]
    const rows = computeWeakness(stats, [], 200)
    const byKey = new Map(rows.map((r) => [r.key, r]))
    expect(byKey.get('a')!.slow).toBe(1)
    expect(byKey.get('b')!.slow).toBeCloseTo(0.1, 10)
    expect(byKey.get('c')!.slow).toBe(0)
  })

  it('is 0 when either median is unavailable', () => {
    const rows = computeWeakness([evidence({ key: 'a', attempts: 9, errors: 1, medianIntervalMs: 900 })], [], null)
    expect(rows[0].slow).toBe(0)
    const noMedian = computeWeakness([evidence({ key: 'a', attempts: 9, errors: 1 })], [], 200)
    expect(noMedian[0].slow).toBe(0)
  })
})

describe('computeWeakness - recent term', () => {
  it('decays older sessions: identical noise weighs less the further away it is', () => {
    const freshNoise = computeWeakness(
      [],
      [
        { key: 'k', attempts: 20, errors: 10, age: 0 },
        { key: 'k', attempts: 20, errors: 0, age: 6 },
      ],
      null,
    )[0]
    const staleNoise = computeWeakness(
      [],
      [
        { key: 'k', attempts: 20, errors: 0, age: 0 },
        { key: 'k', attempts: 20, errors: 10, age: 6 },
      ],
      null,
    )[0]
    expect(freshNoise.recent).toBeGreaterThan(staleNoise.recent)
    expect(staleNoise.recent).toBeGreaterThan(0)
  })

  it('weights attempts and errors together so recent clean practice lowers the score', () => {
    const noisy = computeWeakness([], [{ key: 'k', attempts: 4, errors: 2, age: 0 }], null)[0]
    const clean = computeWeakness([], [{ key: 'k', attempts: 4, errors: 0, age: 0 }], null)[0]
    expect(clean.recent).toBe(0)
    expect(noisy.recent).toBeGreaterThan(clean.recent)
  })

  it('is 0 with no recent samples', () => {
    expect(computeWeakness([evidence({ key: 'k', attempts: 10, errors: 3 })], [], null)[0].recent).toBe(0)
  })
})

describe('mastery rule', () => {
  const userMedian = 200

  it('marks a key mastered at >= 40 attempts, >= 95% accuracy and within the speed target', () => {
    const [row] = computeWeakness(
      [evidence({ key: 'f', attempts: 80, errors: 2, medianIntervalMs: 240 })],
      [],
      userMedian,
    )
    expect(row.mastered).toBe(true)
  })

  it('is not mastered below the attempt floor', () => {
    const [row] = computeWeakness(
      [evidence({ key: 'f', attempts: 39, errors: 0, medianIntervalMs: 200 })],
      [],
      userMedian,
    )
    expect(row.mastered).toBe(false)
  })

  it('is not mastered below the accuracy floor or above the speed ratio', () => {
    const inaccurate = computeWeakness(
      [evidence({ key: 'f', attempts: 100, errors: 6, medianIntervalMs: 200 })],
      [],
      userMedian,
    )[0]
    expect(inaccurate.mastered).toBe(false)
    const tooSlow = computeWeakness(
      [evidence({ key: 'f', attempts: 100, errors: 1, medianIntervalMs: 251 })],
      [],
      userMedian,
    )[0]
    expect(tooSlow.mastered).toBe(false)
  })
})

describe('recommend', () => {
  const lessons = [
    { id: 'home-row', targetKeys: ['a', 's', 'd', 'f'] },
    { id: 'top-row', targetKeys: ['q', 'w', 'e', 'r'] },
    { id: 'words', targetKeys: ['t', 'h', 'e', 'o'] },
  ]

  it('prefers the lesson covering the strongest weak keys', () => {
    const keyStats = [
      evidence({ key: 'q', attempts: 60, errors: 18, medianIntervalMs: 200 }),
      evidence({ key: 'w', attempts: 60, errors: 15, medianIntervalMs: 200 }),
      evidence({ key: 'a', attempts: 60, errors: 1, medianIntervalMs: 200 }),
      evidence({ key: 'f', attempts: 60, errors: 0, medianIntervalMs: 200 }),
    ]
    const rec = recommend(lessons, snapshot({ keyStats, userMedianIntervalMs: 200 }))
    expect(rec!.lesson.id).toBe('top-row')
    expect(rec!.weakKeys).toContain('q')
    expect(rec!.weakKeys).toContain('w')
  })

  it('explains slow keys when slowness dominates and errors when mistakes dominate', () => {
    const slowStats = [evidence({ key: 'q', attempts: 50, errors: 0, medianIntervalMs: 400 })]
    const slowRec = recommend(lessons, snapshot({ keyStats: slowStats, userMedianIntervalMs: 200 }))
    expect(slowRec!.reason).toContain('slower responses on Q')
    expect(slowRec!.reason).not.toContain('more mistakes')

    const errorStats = [evidence({ key: 'w', attempts: 50, errors: 15, medianIntervalMs: 200 })]
    const errorRec = recommend(lessons, snapshot({ keyStats: errorStats, userMedianIntervalMs: 200 }))
    expect(errorRec!.reason).toContain('more mistakes on W')
    expect(errorRec!.reason).not.toContain('slower responses')
  })

  it('lists mastered keys from the chosen lesson so practice keeps them fresh', () => {
    const keyStats = [
      evidence({ key: 'q', attempts: 60, errors: 12, medianIntervalMs: 200 }),
      evidence({ key: 'e', attempts: 80, errors: 1, medianIntervalMs: 210 }),
    ]
    const rec = recommend(lessons, snapshot({ keyStats, userMedianIntervalMs: 200 }))
    expect(rec!.lesson.id).toBe('top-row')
    expect(rec!.masteredKeys).toContain('e')
  })

  it('falls back to a balance explanation when there is no history at all', () => {
    const rec = recommend(lessons, snapshot({}))
    expect(rec).not.toBeNull()
    expect(rec!.reason).toContain('no weak spots recorded yet')
  })

  it('is deterministic and returns null for an empty lesson list', () => {
    const first = recommend(lessons, snapshot({}))
    const second = recommend(lessons, snapshot({}))
    expect(first!.lesson.id).toBe(second!.lesson.id)
    expect(recommend([], snapshot({}))).toBeNull()
  })
})

describe('formatKeys', () => {
  it('uppercases letters and joins with commas and "and"', () => {
    expect(formatKeys(['r', 't', 'e'])).toBe('R, T and E')
    expect(formatKeys(['r', 't'])).toBe('R and T')
    expect(formatKeys(['q'])).toBe('q'.toUpperCase())
    expect(formatKeys([';', ','])).toBe('; and ,')
    expect(formatKeys([])).toBe('')
  })
})

describe('slow-down suggestion', () => {
  const events = (correctFlags: boolean[]): TypingEvent[] =>
    correctFlags.map((correct, idx) => ({
      idx,
      expected: 'a',
      typed: correct ? 'a' : 'b',
      tMs: idx * 100,
      correct,
    }))

  it('needs the minimum sample count before suggesting anything', () => {
    const few = events(Array.from({ length: 14 }, (_, i) => i % 2 === 0))
    expect(shouldSuggestSlowDown(few)).toBe(false)
  })

  it('suggests when rolling accuracy drops below the floor', () => {
    // ~67% correct over 30 samples, well below the 85% floor
    const struggling = events(Array.from({ length: 30 }, (_, i) => i % 3 !== 0))
    expect(shouldSuggestSlowDown(struggling)).toBe(true)
    const steady = events(Array.from({ length: 30 }, () => true))
    expect(shouldSuggestSlowDown(steady)).toBe(false)
  })

  it('rollingAccuracy only looks at the window', () => {
    const ev = events([...Array.from({ length: 20 }, () => true), ...Array.from({ length: 10 }, () => false)])
    expect(rollingAccuracy(ev, 10)).toBe(0)
    expect(rollingAccuracy(ev, 30)).toBeCloseTo(20 / 30, 10)
    expect(rollingAccuracy([], 10)).toBeNull()
  })
})
