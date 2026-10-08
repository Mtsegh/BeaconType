import { useCallback, useEffect, useState } from 'react'
import { LessonSelect } from '@/components/LessonSelect'
import { LessonPlayer } from '@/components/LessonPlayer'
import { Onboarding } from '@/components/Onboarding'
import { ResultsScreen } from '@/components/ResultsScreen'
import { recommendNext } from '@/lib/coach'
import { DEFAULT_SETTINGS, ONBOARDED_KEY, SETTING_KEYS, isOnboarded, loadSettings } from '@/lib/settings'
import { toPerKey, toSaveInput } from '@/lib/session'
import type { UISettings } from '@/lib/settings'
import type { NextMission } from '@/lib/coach'
import type { SessionResult } from '@/lib/session'
import type { CoachData, HealthInfo, LessonRow } from '../electron/shared/api'
import type { ErrorMode } from '@/engine'

type Screen =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'onboarding' }
  | { name: 'select' }
  | { name: 'lesson'; lesson: LessonRow }
  | { name: 'results'; result: SessionResult }

const ERROR_MODE: ErrorMode = 'continue'

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [coach, setCoach] = useState<CoachData | null>(null)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [settings, setSettings] = useState<UISettings>(DEFAULT_SETTINGS)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const [nextMission, setNextMission] = useState<NextMission | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      window.btAPI.listLessons(),
      window.btAPI.health(),
      window.btAPI.getCoach(),
      window.btAPI.getSettings(),
    ])
      .then(([lessonRows, info, coachData, settingRows]) => {
        if (!active) return
        setLessons(lessonRows)
        setHealth(info)
        setCoach(coachData)
        setSettings(loadSettings(settingRows))
        // Fresh accounts see onboarding; upgraded installs (with sessions)
        // are treated as onboarded even if the flag predates the column.
        const seen = isOnboarded(settingRows) || coachData.sessions.length > 0
        setScreen(seen ? { name: 'select' } : { name: 'onboarding' })
      })
      .catch((err: unknown) => {
        if (active) setScreen({ name: 'error', message: String(err) })
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.font = settings.fontSize
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
  }, [settings.fontSize, settings.reducedMotion])

  const updateSettings = useCallback((patch: Partial<UISettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    for (const field of Object.keys(patch) as (keyof UISettings)[]) {
      const value = patch[field]
      if (value === undefined) continue
      void window.btAPI.setSetting({ key: SETTING_KEYS[field], value: String(value) })
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

  const leaveOnboarding = () => {
    void window.btAPI.setSetting({ key: ONBOARDED_KEY, value: 'true' })
    setScreen({ name: 'select' })
  }

  const startDiagnostic = () => {
    void window.btAPI.setSetting({ key: ONBOARDED_KEY, value: 'true' })
    const diagnostic = lessons.find((l) => l.id === 'diagnostic')
    if (diagnostic) setScreen({ name: 'lesson', lesson: diagnostic })
    else setScreen({ name: 'select' })
  }

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

        {screen.name === 'onboarding' && (
          <Onboarding onStartDiagnostic={startDiagnostic} onSkip={leaveOnboarding} />
        )}

        {screen.name === 'select' && coach && (
          <LessonSelect
            lessons={lessons}
            coach={coach}
            settings={settings}
            onSelect={(lesson) => setScreen({ name: 'lesson', lesson })}
            onUpdateSetting={updateSettings}
          />
        )}

        {screen.name === 'lesson' && (
          <div className="relative h-full">
            <LessonPlayer lesson={screen.lesson} mode={ERROR_MODE} settings={settings} onComplete={finish} />
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
            coach={coach}
            settings={settings}
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
