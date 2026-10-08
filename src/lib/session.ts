import { aggregatePerKey, median } from '@/engine'
import type { ErrorMode, PerKeyStat, SessionMetrics, TypingEvent } from '@/engine'
import type { SaveSessionInput } from '../../electron/shared/api'

export interface SessionResult {
  lessonId: string
  mode: ErrorMode
  startedAt: number
  metrics: SessionMetrics
  perKey: PerKeyStat[]
  events: TypingEvent[]
}

export function toPerKey(events: TypingEvent[]): PerKeyStat[] {
  const agg = aggregatePerKey(events)
  return [...agg.values()]
    .map((a) => ({
      key: a.key,
      attempts: a.attempts,
      errors: a.errors,
      correct: a.correct,
      medianIntervalMs: median(a.intervalsMs),
    }))
    .sort((a, b) => b.errors - a.errors || b.attempts - a.attempts)
}

export function toSaveInput(result: SessionResult): SaveSessionInput {
  const m = result.metrics
  return {
    lessonId: result.lessonId,
    mode: result.mode,
    formulaVersion: m.formulaVersion,
    // Wall-clock start derived from duration; the in-memory startedAt is a
    // performance.now() stamp and cannot be grouped by calendar day.
    startedAt: Date.now() - m.durationMs,
    durationMs: m.durationMs,
    rawWpm: m.rawWpm,
    netWpm: m.netWpm,
    accuracy: m.accuracy,
    correctedErrors: m.correctedErrors,
    uncorrectedErrors: m.uncorrectedErrors,
    totalKeystrokes: m.totalKeystrokes,
    correctKeystrokes: m.correctKeystrokes,
    typedChars: result.events.length,
    events: result.events.map((e) => ({ idx: e.idx, expected: e.expected, typed: e.typed, tMs: e.tMs, correct: e.correct })),
  }
}