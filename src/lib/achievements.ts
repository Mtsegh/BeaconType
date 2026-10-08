// Achievement badges derived purely from session history — nothing persisted,
// so they can never drift out of sync with the data (or be lost).

import type { SessionSummary } from '../../electron/shared/api'

export interface Achievement {
  id: string
  title: string
  description: string
  earned: boolean
}

export function deriveAchievements(sessions: SessionSummary[]): Achievement[] {
  const lessons = new Set(sessions.map((s) => s.lessonId))
  return [
    {
      id: 'first-transmission',
      title: 'First transmission',
      description: 'Finish one lesson',
      earned: sessions.length >= 1,
    },
    {
      id: 'five-sessions',
      title: 'Regular signal',
      description: 'Complete 5 sessions',
      earned: sessions.length >= 5,
    },
    {
      id: 'sharpshooter',
      title: 'Sharpshooter',
      description: 'Finish a session at 95% accuracy or better',
      earned: sessions.some((s) => s.accuracy >= 0.95),
    },
    {
      id: 'steady-hands',
      title: 'Steady hands',
      description: 'Reach 40 net WPM',
      earned: sessions.some((s) => s.netWpm >= 40),
    },
    {
      id: 'explorer',
      title: 'Explorer',
      description: 'Practice 5 different lessons',
      earned: lessons.size >= 5,
    },
    {
      id: 'deep-focus',
      title: 'Deep focus',
      description: 'Type for 5 minutes in one session',
      earned: sessions.some((s) => s.durationMs >= 300_000),
    },
  ]
}
