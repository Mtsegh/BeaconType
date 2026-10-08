// Renderer glue: pairs the pure engine (src/engine/ml.ts) with the IPC
// payload shapes. The math stays in the engine; this file only adapts types.

import { buildExamples, contextFeatures, evaluateShadowLog, lessonDifficulty, resolveDriver, scoreCandidate, shadowPick, trainModel } from '@/engine'
import type { ShadowEvaluation, ShadowPick, TrainedModel } from '@/engine'
import type { CoachSnapshot } from '@/engine'
import type { CoachData, LessonRow, ShadowLogRow } from '../../electron/shared/api'
import { toSnapshot } from './coach'

export interface ShadowAnalysis {
  snapshot: CoachSnapshot
  /** Training examples currently available (n sessions → n−1 examples). */
  examples: number
  model: TrainedModel | null
  context: number[] | null
}

export function analyzeShadow(lessons: LessonRow[], coach: CoachData): ShadowAnalysis {
  const snapshot = toSnapshot(coach)
  const built = buildExamples(lessons, coach.sessions, snapshot)
  return {
    snapshot,
    examples: built.length,
    model: trainModel(built),
    context: contextFeatures(coach.sessions),
  }
}

export function pickShadow(
  analysis: ShadowAnalysis,
  lessons: LessonRow[],
): ShadowPick | null {
  if (analysis.model == null || analysis.context == null) return null
  return shadowPick(analysis.model, analysis.context, lessons, analysis.snapshot)
}

/** Predicted success for a specific lesson; null without a trained model. */
export function pForLesson(analysis: ShadowAnalysis, lesson: LessonRow): number | null {
  if (analysis.model == null || analysis.context == null) return null
  return scoreCandidate(analysis.model, analysis.context, lessonDifficulty(lesson, analysis.snapshot))
}

export interface ShadowLogFields {
  modelLessonId: string | null
  modelPickP: number | null
  modelRuleP: number | null
}

/**
 * Fields for `logShadow` right after a session saves: the model's own pick,
 * its confidence in that pick, and its prediction for the rule engine's pick
 * (the challenge actually given — this is what calibrates against the next
 * session's outcome).
 */
export function logShadowFields(
  analysis: ShadowAnalysis,
  lessons: LessonRow[],
  rulePick: LessonRow | null,
): ShadowLogFields {
  const pick = pickShadow(analysis, lessons)
  return {
    modelLessonId: pick?.lessonId ?? null,
    modelPickP: pick?.p ?? null,
    modelRuleP: rulePick ? pForLesson(analysis, rulePick) : null,
  }
}

export function driverChoice(input: {
  analysis: ShadowAnalysis
  lessons: LessonRow[]
  rulePick: LessonRow
  adaptiveOn: boolean
}): { driver: 'rules' | 'model'; modelPick: ShadowPick | null; ruleP: number | null } {
  const modelPick = pickShadow(input.analysis, input.lessons)
  const ruleP = pForLesson(input.analysis, input.rulePick)
  const driver = resolveDriver({
    adaptiveOn: input.adaptiveOn,
    ruleLessonId: input.rulePick.id,
    ruleP,
    modelPick,
  })
  return { driver, modelPick, ruleP }
}

export function evaluateLog(rows: ShadowLogRow[], coach: CoachData): ShadowEvaluation {
  return evaluateShadowLog(rows, coach.sessions)
}
