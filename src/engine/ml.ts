// Tiny ML experiment (Phase 4) — educational shadow mode, never the fallback.
// Pure TS: trained and inferred in the renderer, unit-testable outside Electron.
//
// Design (ProjectDescription.md): one training example per consecutive session
// pair. The label is whether the NEXT session met the accuracy target (a
// session row existing means it was completed — abandoned sessions are never
// saved). Learning is slow and noisy by design; the shadow comparison is what
// honestly tells us whether it is useful.

import { computeWeakness } from './coach'
import type { CoachSnapshot, LessonLike } from './coach'

export const ML_VERSION = 1

export const ML_CONFIG = {
  /** A challenge is "right-sized" when the next session lands here. */
  accuracyTarget: 0.95,
  /** Training examples required before the model is used at all. */
  minExamples: 10,
  /** The success probability the recommender steers toward. */
  targetSuccess: 0.75,
  /** The model may only drive when its own pick is at least this likely... */
  minAcceptP: 0.7,
  /** ...and beats the rule pick's prediction by this margin. */
  margin: 0.05,
  /** Sessions considered by the recent-error feature. */
  recentWindow: 5,
  epochs: 600,
  learningRate: 0.2,
  l2: 0.001,
}

/** Number of model inputs: accuracy, relative speed, recent error rate,
 *  session length (minutes) and candidate-lesson key difficulty. */
export const FEATURE_COUNT = 5

export interface MlSession {
  id: number
  lessonId: string
  netWpm: number
  accuracy: number
  durationMs: number
}

export interface TrainingExample {
  features: number[]
  label: 0 | 1
}

export interface TrainedModel {
  mean: number[]
  std: number[]
  weights: number[]
  bias: number
}

export interface ShadowPick {
  lessonId: string
  p: number
}

export function sigmoid(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z))
  }
  const e = Math.exp(z)
  return e / (1 + e)
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function ascending(sessions: MlSession[]): MlSession[] {
  return [...sessions].sort((a, b) => a.id - b.id)
}

/** Context features of session at `i` (the challenge's starting state). */
function contextAt(asc: MlSession[], i: number, medianWpm: number): number[] {
  const prev = asc[i]
  const from = Math.max(0, i - ML_CONFIG.recentWindow + 1)
  let accSum = 0
  for (let k = from; k <= i; k++) accSum += asc[k].accuracy
  const recentErrorRate = 1 - accSum / (i - from + 1)
  const relSpeed = medianWpm > 0 ? prev.netWpm / medianWpm : 0
  return [prev.accuracy, relSpeed, recentErrorRate, prev.durationMs / 60_000]
}

/** Mean weakness of a lesson's target keys (unknown keys stay neutral);
 *  0.5 when the lesson has no tracked data yet. */
export function lessonDifficulty(lesson: LessonLike, snapshot: CoachSnapshot): number {
  const weaknesses = computeWeakness(snapshot.keyStats, snapshot.recent, snapshot.userMedianIntervalMs)
  const byKey = new Map(weaknesses.map((w) => [w.key, w]))
  const known = lesson.targetKeys.map((k) => byKey.get(k)).filter((w): w is NonNullable<typeof w> => w != null)
  if (known.length === 0) return 0.5
  return known.reduce((s, w) => s + w.weakness, 0) / known.length
}

/** One example per consecutive session pair, oldest first. */
export function buildExamples(
  lessons: LessonLike[],
  sessions: MlSession[],
  snapshot: CoachSnapshot,
): TrainingExample[] {
  const asc = ascending(sessions)
  if (asc.length < 2) return []
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  const medianWpm = median(asc.map((s) => s.netWpm).filter((w) => w > 0)) ?? 0

  const examples: TrainingExample[] = []
  for (let i = 0; i < asc.length - 1; i++) {
    const next = asc[i + 1]
    const nextLesson = lessonById.get(next.lessonId)
    const difficulty = nextLesson ? lessonDifficulty(nextLesson, snapshot) : 0.5
    examples.push({
      features: [...contextAt(asc, i, medianWpm), difficulty],
      label: next.accuracy >= ML_CONFIG.accuracyTarget ? 1 : 0,
    })
  }
  return examples
}

/** Full-batch logistic regression with L2 — deterministic, no RNG. */
export function trainModel(examples: TrainingExample[]): TrainedModel | null {
  if (examples.length < ML_CONFIG.minExamples) return null

  const n = examples.length
  const mean: number[] = new Array(FEATURE_COUNT).fill(0)
  const std: number[] = new Array(FEATURE_COUNT).fill(1)
  for (const ex of examples) {
    for (let f = 0; f < FEATURE_COUNT; f++) mean[f] += ex.features[f] / n
  }
  for (const ex of examples) {
    for (let f = 0; f < FEATURE_COUNT; f++) std[f] += (ex.features[f] - mean[f]) ** 2 / n
  }
  for (let f = 0; f < FEATURE_COUNT; f++) std[f] = Math.sqrt(std[f]) < 1e-9 ? 1 : Math.sqrt(std[f])

  const normalized = examples.map((ex) => ex.features.map((v, f) => (v - mean[f]) / std[f]))
  const weights: number[] = new Array(FEATURE_COUNT).fill(0)
  let bias = 0
  const { epochs, learningRate, l2 } = ML_CONFIG

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW: number[] = new Array(FEATURE_COUNT).fill(0)
    let gradB = 0
    for (let e = 0; e < n; e++) {
      let z = bias
      for (let f = 0; f < FEATURE_COUNT; f++) z += weights[f] * normalized[e][f]
      const err = sigmoid(z) - examples[e].label
      for (let f = 0; f < FEATURE_COUNT; f++) gradW[f] += (err * normalized[e][f]) / n
      gradB += err / n
    }
    for (let f = 0; f < FEATURE_COUNT; f++) {
      weights[f] -= learningRate * (gradW[f] + l2 * weights[f])
    }
    bias -= learningRate * gradB
  }

  return { mean, std, weights, bias }
}

export function predict(model: TrainedModel, features: number[]): number {
  let z = model.bias
  for (let f = 0; f < features.length; f++) {
    z += model.weights[f] * ((features[f] - model.mean[f]) / model.std[f])
  }
  return sigmoid(z)
}

/** Context features of the most recent session, or null with no history. */
export function contextFeatures(sessions: MlSession[]): number[] | null {
  const asc = ascending(sessions)
  if (asc.length === 0) return null
  const medianWpm = median(asc.map((s) => s.netWpm).filter((w) => w > 0)) ?? 0
  return contextAt(asc, asc.length - 1, medianWpm)
}

export function scoreCandidate(
  model: TrainedModel,
  context: number[],
  difficulty: number,
): number {
  return predict(model, [...context, difficulty])
}

/** The lesson whose predicted success lands closest to the target rate. */
export function shadowPick(
  model: TrainedModel,
  context: number[],
  candidates: LessonLike[],
  snapshot: CoachSnapshot,
): ShadowPick | null {
  if (candidates.length === 0) return null
  let best: ShadowPick | null = null
  let bestDelta = Number.POSITIVE_INFINITY
  for (const lesson of candidates) {
    const p = scoreCandidate(model, context, lessonDifficulty(lesson, snapshot))
    const delta = Math.abs(p - ML_CONFIG.targetSuccess)
    // Strictly closer wins; exact ties break on lesson id for determinism.
    if (delta < bestDelta || (delta === bestDelta && lesson.id < (best?.lessonId ?? ''))) {
      bestDelta = delta
      best = { lessonId: lesson.id, p }
    }
  }
  return best
}

/**
 * Shadow rule: adaptive must be explicitly on, the model must have a
 * different pick, it must be confident, and it must beat the rule pick's
 * prediction — otherwise the rules stay in charge.
 */
export function resolveDriver(input: {
  adaptiveOn: boolean
  ruleLessonId: string
  ruleP: number | null
  modelPick: ShadowPick | null
}): 'rules' | 'model' {
  const { adaptiveOn, ruleLessonId, ruleP, modelPick } = input
  if (!adaptiveOn || modelPick == null || ruleP == null) return 'rules'
  if (modelPick.lessonId === ruleLessonId) return 'rules'
  if (modelPick.p < ML_CONFIG.minAcceptP) return 'rules'
  if (modelPick.p - ruleP < ML_CONFIG.margin) return 'rules'
  return 'model'
}

export interface ShadowLogEntry {
  sessionId: number
  ruleLessonId: string
  modelLessonId: string | null
  modelRuleP: number | null
}

export interface ShadowRowOutcome extends ShadowLogEntry {
  /** Whether the session AFTER the logged one hit the target; null = pending. */
  outcome: boolean | null
}

export interface ShadowEvaluation {
  rows: ShadowRowOutcome[]
  withModel: number
  agreements: number
  agreementRate: number | null
  withOutcome: number
  /** Mean squared error of the logged predictions against actual outcomes. */
  brier: number | null
}

export function evaluateShadowLog(entries: ShadowLogEntry[], sessions: MlSession[]): ShadowEvaluation {
  const asc = ascending(sessions)
  const rows: ShadowRowOutcome[] = entries.map((entry) => {
    const next = asc.find((s) => s.id > entry.sessionId)
    return {
      ...entry,
      outcome: next ? next.accuracy >= ML_CONFIG.accuracyTarget : null,
    }
  })

  const withModelRows = rows.filter((r) => r.modelLessonId != null)
  const agreements = withModelRows.filter((r) => r.modelLessonId === r.ruleLessonId).length

  const scored = rows.filter((r) => r.modelRuleP != null && r.outcome != null)
  const brier =
    scored.length === 0
      ? null
      : scored.reduce((s, r) => s + (r.modelRuleP as number - (r.outcome ? 1 : 0)) ** 2, 0) / scored.length

  return {
    rows,
    withModel: withModelRows.length,
    agreements,
    agreementRate: withModelRows.length > 0 ? agreements / withModelRows.length : null,
    withOutcome: scored.length,
    brier,
  }
}
