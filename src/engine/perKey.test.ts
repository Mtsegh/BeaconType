import { describe, it, expect } from 'vitest'
import { aggregatePerKey, median } from './perKey'
import type { TypingEvent } from './types'

// Passages: "salt salt"
const events: TypingEvent[] = [
  { idx: 0, expected: 's', typed: 's', tMs: 0, correct: true },
  { idx: 1, expected: 'a', typed: 'a', tMs: 100, correct: true },
  { idx: 2, expected: 'l', typed: 'l', tMs: 250, correct: true },
  { idx: 3, expected: 't', typed: 't', tMs: 400, correct: true },
  { idx: 4, expected: ' ', typed: ' ', tMs: 550, correct: true },
  { idx: 5, expected: 's', typed: 's', tMs: 700, correct: true },
  { idx: 6, expected: 'a', typed: 'a', tMs: 850, correct: true },
  // mistake on the second 'l' - attributed to the EXPECTED key 'l'
  { idx: 7, expected: 'l', typed: 'e', tMs: 1000, correct: false },
  { idx: 8, expected: 't', typed: 't', tMs: 1150, correct: true },
]

describe('aggregatePerKey', () => {
  it('attributes errors to the expected key, not the mistyped one', () => {
    const stats = aggregatePerKey(events)
    const l = stats.get('l')!
    expect(l.attempts).toBe(2)
    expect(l.errors).toBe(1)
    expect(l.correct).toBe(1)
    // no 'e' key in the passage, so no bucket can exist for it
    expect(stats.has('e')).toBe(false)
  })

  it('measures interval only after correct keystrokes, from the previous keystroke', () => {
    const stats = aggregatePerKey(events)
    expect(stats.get('s')!.intervalsMs).toEqual([150])
    expect(stats.get('a')!.intervalsMs).toEqual([100, 150])
    expect(stats.get('l')!.intervalsMs).toEqual([150])
  })

  it('leaves the first keystroke with no interval', () => {
    const stats = aggregatePerKey([events[0]])
    expect(stats.get('s')!.intervalsMs).toEqual([])
  })
})

describe('median', () => {
  it('returns midpoint for odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([100, 150])).toBe(125)
  })
  it('returns null for no samples', () => {
    expect(median([])).toBeNull()
  })
})