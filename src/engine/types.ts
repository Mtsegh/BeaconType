// Typing engine types. This module must stay free of any Electron, DOM or
// storage imports - it is the unit-tested core and runs headless in Vitest.

export const FORMULA_VERSION = 1 as const

export type ErrorMode = 'continue' | 'stop'

export interface TypingEvent {
  idx: number
  expected: string
  typed: string
  tMs: number
  correct: boolean
}

export interface TypingSession {
  startedAt: number
  durationMs: number
  passage: string
  mode: ErrorMode
  events: TypingEvent[]
}

export interface SessionMetrics {
  totalKeystrokes: number
  correctKeystrokes: number
  uncorrectedErrors: number
  correctedErrors: number
  accuracy: number
  rawWpm: number
  netWpm: number
  durationMs: number
  formulaVersion: number
}

export interface PerKeyStat {
  key: string
  attempts: number
  errors: number
  correct: number
  medianIntervalMs: number | null
}

export interface KeystrokeCandidate {
  char: string
  code: string
}

export function computeMetrics(session: TypingSession): SessionMetrics {
  const total = session.events.length
  const correct = session.events.filter((e) => e.correct).length

  const minutes = Math.max(session.durationMs, 1) / 60_000
  // rawWPM counts every keystroke, corrected or not.
  const rawWpm = (total / 5) / minutes
  // netWPM counts only the correct characters that survive in the final
  // text. Phase-1 has no editing, so that is just the correct keystrokes.
  const netWpm = (correct / 5) / minutes

  // No backspace/correction support yet, so corrected errors are 0.
  const correctedErrors = 0
  const uncorrectedErrors = total - correct

  return {
    totalKeystrokes: total,
    correctKeystrokes: correct,
    uncorrectedErrors,
    correctedErrors,
    accuracy: total === 0 ? 0 : correct / total,
    rawWpm,
    netWpm,
    durationMs: session.durationMs,
    formulaVersion: FORMULA_VERSION,
  }
}