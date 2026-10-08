// Per-key statistics from a raw event stream.
//
// - Errors attribute to the EXPECTED key, not the key the user actually
//   pressed (we're finding which targets the user struggles to hit).
// - Speed is computed from the interval AFTER a *correct* keystroke on that
//   key, compared against the user's overall spread elsewhere, never from
//   the raw key itself (inter-key transition speed mostly reflects the
//   letter pair, not the key). Median per-key intervals feed the adaptive
//   coach formula in Phase 2.

import type { TypingEvent } from './types'

export interface PerKeyAggregate {
  key: string
  attempts: number
  errors: number
  correct: number
  intervalsMs: number[]
}

export function aggregatePerKey(events: TypingEvent[]): Map<string, PerKeyAggregate> {
  const map = new Map<string, PerKeyAggregate>()

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const bucket = map.get(event.expected) ?? {
      key: event.expected,
      attempts: 0,
      errors: 0,
      correct: 0,
      intervalsMs: [],
    }
    bucket.attempts += 1
    if (event.correct) {
      bucket.correct += 1
      // interval measured from the PREVIOUS keystroke (any key)
      if (i > 0) bucket.intervalsMs.push(event.tMs - events[i - 1].tMs)
    } else {
      bucket.errors += 1
    }
    map.set(event.expected, bucket)
  }

  return map
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}