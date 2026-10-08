import { useCallback, useEffect, useState } from 'react'
import { LessonSelect } from '@/components/LessonSelect'
import { LessonPlayer } from '@/components/LessonPlayer'
import { ResultsScreen } from '@/components/ResultsScreen'
import { recommendNext } from '@/lib/coach'
import { toPerKey, toSaveInput } from '@/lib/session'
import type { NextMission } from '@/lib/coach'
import type { SessionResult } from '@/lib/session'
import type { CoachData, HealthInfo, LessonRow } from '../electron/shared/api'
import type { ErrorMode } from '@/engine'

type Screen =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'select' }
  | { name: 'lesson'; lesson: LessonRow }
  | { name: 'results'; result: SessionResult }

const ERROR_MODE: ErrorMode = 'continue'

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [coach, setCoach] = useState<CoachData | null>(null)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const [nextMission, setNextMission] = useState<NextMission | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([window.btAPI.listLessons(), window.btAPI.health(), window.btAPI.getCoach()])
      .then(([lessonRows, info, coachData]) => {
        if (!active) return
        setLessons(lessonRows)
        setHealth(info)
        setCoach(coachData)
        setScreen({ name: 'select' })
      })
      .catch((err: unknown) => {
        if (active) setScreen({ name: 'error', message: String(err) })
      })
    return () => {
      active = false
    }
  }, [])

  const finish = useCallback(
    async (result: SessionResult) => {
      result.perKey = toPerKey(result.events)
      setScreen({ name: 'results', result })
      setSaveStatus('saving')
      setNextMission(null)
      try {
        await window.btAPI.saveSession(toSaveInput(result))
        setSaveStatus('saved')
        // Fresh stats change the recommendation, so reload the coach data.
        const fresh = await window.btAPI.getCoach()
        setCoach(fresh)
        setNextMission(recommendNext(lessons, fresh, result.lessonId))
      } catch {
        setSaveStatus('error')
      }
    },
    [lessons],
  )

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1">
        {screen.name === 'loading' && (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">Connecting…</div>
        )}

        {screen.name === 'error' && (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-md rounded-xl bg-[var(--surface)] p-6 text-sm ring-1 ring-[var(--border)]">
              <p className="mb-2 font-semibold text-[var(--danger)]">Could not reach the Beacon Type database.</p>
              <p className="text-[var(--muted)]">
                This renderer needs the Electron preload bridge. {screen.message}
              </p>
            </div>
          </div>
        )}

        {screen.name === 'select' && coach && (
          <LessonSelect lessons={lessons} coach={coach} onSelect={(lesson) => setScreen({ name: 'lesson', lesson })} />
        )}

        {screen.name === 'lesson' && (
          <div className="relative h-full">
            <LessonPlayer lesson={screen.lesson} mode={ERROR_MODE} onComplete={finish} />
            <button
              type="button"
              onClick={() => setScreen({ name: 'select' })}
              className="absolute right-8 bottom-8 rounded-lg bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text)]"
            >
              Abandon lesson
            </button>
          </div>
        )}

        {screen.name === 'results' && (
          <ResultsScreen
            result={screen.result}
            saveStatus={saveStatus}
            next={nextMission}
            onDone={() => setScreen({ name: 'select' })}
            onStartNext={(lesson) => setScreen({ name: 'lesson', lesson })}
          />
        )}
      </main>

      {health && (
        <footer className="flex items-center justify-between border-t border-[var(--border)] px-6 py-2 text-[11px] text-[var(--muted)]">
          <span>{health.dbPath}</span>
          <span>schema v{health.schemaVersion}</span>
        </footer>
      )}
    </div>
  )
}
