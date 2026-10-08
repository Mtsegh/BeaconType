// Renderer glue between the CoachData IPC payload and the pure engine.
// Keeps electron/shared types out of the engine itself.

import { recommend } from '@/engine'
import type { CoachSnapshot } from '@/engine'
import type { CoachData, LessonRow } from '../../electron/shared/api'

export function toSnapshot(data: CoachData): CoachSnapshot {
  return {
    keyStats: data.keyStats,
    recent: data.recentKeyErrors,
    userMedianIntervalMs: data.userMedianIntervalMs,
  }
}

export interface NextMission {
  lesson: LessonRow
  reason: string
}

export function recommendNext(
  lessons: LessonRow[],
  coach: CoachData,
  excludeLessonId?: string,
): NextMission | null {
  const candidates = lessons.filter((l) => l.id !== excludeLessonId)
  const pool = candidates.length > 0 ? candidates : lessons
  const rec = recommend(pool, toSnapshot(coach))
  return rec ? { lesson: rec.lesson, reason: rec.reason } : null
}
