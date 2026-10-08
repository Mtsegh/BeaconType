// Rule-based adaptive coach (Phase 2). Pure TS like the rest of the engine:
// no Electron, no DOM, no storage. Every tunable number lives in
// COACH_CONFIG so the weights can be tuned against real sessions without
// touching the formulas.

import type { TypingEvent } from './types'

export const COACH_CONFIG = {
  // weakness = weights.err·err + weights.slow·slow + weights.recent·recent
  weights: { err: 0.55, slow: 0.25, recent: 0.2 },
  // Laplace-style prior: with no history a key behaves like a ~5% error
  // rate instead of "0% forever" or "100% after one slip".
  smoothing: { priorErrors: 1, priorAttempts: 20 },
  // Error rates at or above this count as fully "err" after scaling to 0-1.
  errScale: 0.25,
  // recent_k looks at the newest sessions with exponential decay.
  recent: { sessions: 10, halfLifeSessions: 5 },
  // A key is mastered when accuracy >= minAccuracy over >= minAttempts AND
  // its median interval is within maxMedianRatio of the user's median.
  mastery: { minAttempts: 40, minAccuracy: 0.95, maxMedianRatio: 1.25 },
  // Lesson selection prefers a natural mix: about this share of the lesson's
  // target keys should be weak, the rest mastered or unseen.
  lesson: { weakKeyShare: 0.65, mixTolerance: 0.2, minWeakness: 0.15 },
  // Gentle mid-lesson suggestion when recent accuracy collapses.
  slowDown: { window: 30, minSamples: 15, accuracyFloor: 0.85 },
} as const

export interface KeyEvidence {
  key: string
  attempts: number
  errors: number
  medianIntervalMs: number | null
  streak: number
}

export interface RecentSample {
  key: string
  attempts: number
  errors: number
  /** 0 = newest session, 1 = the one before, ... */
  age: number
}

export interface CoachSnapshot {
  keyStats: KeyEvidence[]
  recent: RecentSample[]
  userMedianIntervalMs: number | null
}

export interface KeyWeakness {
  key: string
  weakness: number
  err: number
  slow: number
  recent: number
  attempts: number
  errors: number
  mastered: boolean
}

export interface LessonLike {
  id: string
  targetKeys: string[]
}

export interface LessonRecommendation<T extends LessonLike = LessonLike> {
  lesson: T
  /** Targeted keys that are currently weak, strongest first. */
  weakKeys: string[]
  /** Targeted keys that satisfy the mastery rule (kept in rotation). */
  masteredKeys: string[]
  /** Human-readable "Why this lesson?". */
  reason: string
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

function isMastered(
  evidence: KeyEvidence,
  userMedianIntervalMs: number | null,
  config: typeof COACH_CONFIG,
): boolean {
  const { minAttempts, minAccuracy, maxMedianRatio } = config.mastery
  if (evidence.attempts < minAttempts) return false
  const accuracy = (evidence.attempts - evidence.errors) / evidence.attempts
  if (accuracy < minAccuracy) return false
  if (evidence.medianIntervalMs == null || userMedianIntervalMs == null || userMedianIntervalMs <= 0) return false
  return evidence.medianIntervalMs / userMedianIntervalMs <= maxMedianRatio
}

export function computeWeakness(
  keyStats: KeyEvidence[],
  recent: RecentSample[],
  userMedianIntervalMs: number | null,
  config: typeof COACH_CONFIG = COACH_CONFIG,
): KeyWeakness[] {
  const { err: wErr, slow: wSlow, recent: wRecent } = config.weights
  const { priorErrors, priorAttempts } = config.smoothing

  // Decay-weighted recent error mass per key.
  const recentByKey = new Map<string, { attempts: number; errors: number; weightedAttempts: number; weightedErrors: number }>()
  for (const sample of recent) {
    const weight = Math.pow(0.5, sample.age / config.recent.halfLifeSessions)
    const bucket = recentByKey.get(sample.key) ?? { attempts: 0, errors: 0, weightedAttempts: 0, weightedErrors: 0 }
    bucket.attempts += sample.attempts
    bucket.errors += sample.errors
    bucket.weightedAttempts += weight * sample.attempts
    bucket.weightedErrors += weight * sample.errors
    recentByKey.set(sample.key, bucket)
  }

  // A key can appear in recent sessions while missing from the lifetime
  // cache (e.g. after a cache rebuild) - never drop that evidence.
  const evidenceByKey = new Map(keyStats.map((e) => [e.key, e]))
  for (const [key, bucket] of recentByKey) {
    if (!evidenceByKey.has(key)) {
      evidenceByKey.set(key, { key, attempts: bucket.attempts, errors: bucket.errors, medianIntervalMs: null, streak: 0 })
    }
  }

  const rows: KeyWeakness[] = [...evidenceByKey.values()].map((e) => {
    const errorRate = (e.errors + priorErrors) / (e.attempts + priorAttempts)
    const err = Math.min(errorRate / config.errScale, 1)

    let slow = 0
    if (e.medianIntervalMs != null && userMedianIntervalMs != null && userMedianIntervalMs > 0) {
      slow = clamp(e.medianIntervalMs / userMedianIntervalMs - 1, 0, 1)
    }

    const bucket = recentByKey.get(e.key)
    let recentScore = 0
    if (bucket && bucket.weightedAttempts > 0) {
      const rate = bucket.weightedErrors / bucket.weightedAttempts
      recentScore = Math.min(rate / config.errScale, 1)
    }

    return {
      key: e.key,
      err,
      slow,
      recent: recentScore,
      weakness: wErr * err + wSlow * slow + wRecent * recentScore,
      attempts: e.attempts,
      errors: e.errors,
      mastered: isMastered(e, userMedianIntervalMs, config),
    }
  })

  return rows.sort((a, b) => b.weakness - a.weakness || a.key.localeCompare(b.key))
}

/** Formats key names for humans: letters uppercased, "R, T and E". */
export function formatKeys(keys: string[]): string {
  const parts = keys.map((k) => (k.length === 1 && k.toLowerCase() !== k.toUpperCase() ? k.toUpperCase() : k))
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

function explain(weak: KeyWeakness[]): string {
  if (weak.length === 0) {
    return 'no weak spots recorded yet — a balanced pick to build your history'
  }
  const slowKeys = weak.filter((w) => w.slow >= w.err).map((w) => w.key)
  const errorKeys = weak.filter((w) => w.err > w.slow).map((w) => w.key)
  const parts: string[] = []
  if (slowKeys.length > 0) parts.push(`slower responses on ${formatKeys(slowKeys)}`)
  if (errorKeys.length > 0) parts.push(`more mistakes on ${formatKeys(errorKeys)}`)
  return parts.join(' and ')
}

export function recommend<T extends LessonLike>(
  lessons: T[],
  snapshot: CoachSnapshot,
  config: typeof COACH_CONFIG = COACH_CONFIG,
): LessonRecommendation<T> | null {
  if (lessons.length === 0) return null

  const weaknesses = computeWeakness(snapshot.keyStats, snapshot.recent, snapshot.userMedianIntervalMs, config)
  const byKey = new Map(weaknesses.map((w) => [w.key, w]))
  const { weakKeyShare, mixTolerance, minWeakness } = config.lesson

  interface Scored {
    lesson: T
    score: number
    novelty: number
    weak: KeyWeakness[]
    mastered: string[]
  }

  const scored: Scored[] = lessons.map((lesson) => {
    const keys = [...new Set(lesson.targetKeys)]
    const entries = keys.map((k) => byKey.get(k))
    const sum = entries.reduce<number>((s, e) => s + (e?.weakness ?? 0), 0)
    const mean = keys.length > 0 ? sum / keys.length : 0
    const weak = entries.filter((e): e is KeyWeakness => e != null && e.weakness >= minWeakness)
    const share = keys.length > 0 ? weak.length / keys.length : 0
    // Prefer lessons whose target mix sits near the configured weak-key share.
    const mixBonus = Math.abs(share - weakKeyShare) <= mixTolerance ? 0.1 : 0
    return {
      lesson,
      score: mean + mixBonus,
      novelty: -entries.reduce<number>((s, e) => s + (e?.attempts ?? 0), 0),
      weak: weak.sort((a, b) => b.weakness - a.weakness),
      mastered: entries.filter((e) => e?.mastered).map((e) => (e as KeyWeakness).key),
    }
  })

  scored.sort(
    (a, b) => b.score - a.score || b.novelty - a.novelty || a.lesson.id.localeCompare(b.lesson.id),
  )
  const best = scored[0]

  return {
    lesson: best.lesson,
    weakKeys: best.weak.map((w) => w.key),
    masteredKeys: best.mastered,
    reason: explain(best.weak),
  }
}

export function rollingAccuracy(events: TypingEvent[], window: number): number | null {
  const slice = events.slice(-window)
  if (slice.length === 0) return null
  const correct = slice.filter((e) => e.correct).length
  return correct / slice.length
}

export function shouldSuggestSlowDown(
  events: TypingEvent[],
  config: typeof COACH_CONFIG = COACH_CONFIG,
): boolean {
  const { window, minSamples, accuracyFloor } = config.slowDown
  if (events.length < minSamples) return false
  const accuracy = rollingAccuracy(events, window)
  return accuracy != null && accuracy < accuracyFloor
}
