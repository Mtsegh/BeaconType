import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ML_CONFIG, computeWeakness, recommend } from '@/engine'
import { deriveAchievements } from '@/lib/achievements'
import { toSnapshot } from '@/lib/coach'
import { analyzeShadow, driverChoice, evaluateLog } from '@/lib/shadow'
import type { UISettings } from '@/lib/settings'
import type { CoachData, LessonRow, ShadowLogRow } from '../../electron/shared/api'
import { SettingsPanel } from './SettingsPanel'

interface LessonSelectProps {
  lessons: LessonRow[]
  coach: CoachData
  settings: UISettings
  mlLog: ShadowLogRow[]
  onSelect: (lesson: LessonRow) => void
  onUpdateSetting: (patch: Partial<UISettings>) => void
}

export function LessonSelect({ lessons, coach, settings, mlLog, onSelect, onUpdateSetting }: LessonSelectProps) {
  const [showSettings, setShowSettings] = useState(false)
  const snapshot = toSnapshot(coach)
  const recommendation = recommend(lessons, snapshot)
  const weaknesses = computeWeakness(
    snapshot.keyStats,
    snapshot.recent,
    snapshot.userMedianIntervalMs,
  )
  const weakKeys = weaknesses.filter((w) => !w.mastered && w.attempts > 0 && w.weakness > 0).slice(0, 6)
  const masteredCount = weaknesses.filter((w) => w.mastered).length

  const analysis = analyzeShadow(lessons, coach)
  const evaluation = evaluateLog(mlLog, coach)
  const choice = recommendation
    ? driverChoice({
        analysis,
        lessons,
        rulePick: recommendation.lesson,
        adaptiveOn: settings.adaptiveCoach,
      })
    : null
  const driver = choice?.driver ?? 'rules'
  const modelPick = choice?.modelPick ?? null
  const shownLesson =
    driver === 'model' && modelPick
      ? lessons.find((l) => l.id === modelPick.lessonId) ?? recommendation?.lesson ?? null
      : recommendation?.lesson ?? null
  const whyText =
    driver === 'model' && modelPick
      ? `the model expects ${Math.round(modelPick.p * 100)}% odds the next session hits ${Math.round(ML_CONFIG.accuracyTarget * 100)}% accuracy${
          choice?.ruleP != null ? ` (rule pick: ${Math.round(choice.ruleP * 100)}%)` : ''
        }`
      : recommendation?.reason ?? null

  const doneMinutes = coach.todayPracticeMs / 60_000
  const goalMinutes = coach.dailyGoalMinutes
  const goalPct = Math.min(100, Math.round((doneMinutes / Math.max(goalMinutes, 1)) * 100))

  const trend = [...coach.sessions].reverse().map((s) => ({
    label: new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    wpm: Math.round(s.netWpm),
    accuracy: Math.round(s.accuracy * 100),
  }))

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Beacon Type</h1>
            <p className="text-sm text-[var(--muted)]">
              Pick a transmission to practice. Use the tab key to navigate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Settings
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={onUpdateSetting}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {recommendation && shownLesson && (
            <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--accent)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {driver === 'model' ? 'Adaptive pick' : 'Recommended next'}
              </p>
              <h2 className="mt-1 text-lg font-bold">{shownLesson.id}</h2>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {shownLesson.category}
              </p>
              <p className="mt-2 text-sm">
                <span className="font-semibold">Why this lesson?</span>{' '}
                <span className="text-[var(--muted)]">{whyText}.</span>
              </p>
              {driver === 'model' && (
                <p className="mt-1 text-xs text-[var(--accent)]">
                  Steered by the local model (rules stay the fallback).
                </p>
              )}
              <button
                type="button"
                onClick={() => onSelect(shownLesson)}
                className="mt-4 rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                Start recommended lesson
              </button>
            </section>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {lessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => onSelect(lesson)}
                className="rounded-xl bg-[var(--surface)] p-5 text-left ring-1 ring-[var(--border)] transition-colors hover:ring-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  {lesson.category}
                </span>
                <span className="mt-1 block text-base font-semibold">{lesson.id}</span>
                <span className="mt-1 block truncate font-mono text-sm text-[var(--muted)]">{lesson.content}</span>
                <span className="mt-3 block text-xs text-[var(--muted)]">
                  Focus: {lesson.targetKeys.map((k) => `"${k}"`).join(' ')}
                </span>
              </button>
            ))}
          </div>

          <section
            aria-label="Adaptive coach (shadow)"
            className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Adaptive coach (shadow)</h2>
              <span className="text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                {settings.adaptiveCoach ? 'steering enabled' : 'shadow only'}
              </span>
            </div>

            {!analysis.model ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Collecting data — {analysis.examples} of {ML_CONFIG.minExamples} training examples
                needed before the model trains. Rules stay in charge.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Model trained locally on {analysis.examples} example{analysis.examples === 1 ? '' : 's'}.
                {evaluation.agreementRate != null
                  ? ` It agreed with the rule engine on ${Math.round(evaluation.agreementRate * 100)}% of logged picks.`
                  : ' No comparisons logged yet.'}
                {evaluation.brier != null &&
                  ` Calibration (Brier): ${evaluation.brier.toFixed(3)} over ${evaluation.withOutcome} outcome${
                    evaluation.withOutcome === 1 ? '' : 's'
                  }.`}
              </p>
            )}

            {evaluation.rows.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 text-xs">
                {evaluation.rows.slice(0, 5).map((r) => (
                  <li key={r.sessionId} className="flex flex-wrap gap-x-3 text-[var(--muted)]">
                    <span className="font-mono">#{r.sessionId}</span>
                    <span>
                      rules → <span className="text-[var(--text)]">{r.ruleLessonId}</span>
                    </span>
                    <span>
                      model →{' '}
                      <span className="text-[var(--text)]">{r.modelLessonId ?? '—'}</span>
                      {r.modelRuleP != null && ` (p=${r.modelRuleP.toFixed(2)})`}
                    </span>
                    <span>
                      next:{' '}
                      <span
                        className={
                          r.outcome === true
                            ? 'text-[var(--ok)]'
                            : r.outcome === false
                              ? 'text-[var(--danger)]'
                              : ''
                        }
                      >
                        {r.outcome === true
                          ? 'target met'
                          : r.outcome === false
                            ? 'target missed'
                            : 'pending'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-[var(--muted)]">
                No shadow entries yet — one appears after each saved session.
              </p>
            )}

            <p className="mt-3 text-[0.65rem] text-[var(--muted)]">
              Outcome = whether the following session hit {Math.round(ML_CONFIG.accuracyTarget * 100)}%
              accuracy. The model only steers lessons when Adaptive Coach is on and its pick is clearly
              safer; rules remain the fallback.
            </p>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
            <h2 className="text-sm font-semibold">Keys to work on</h2>
            {weakKeys.length > 0 ? (
              <>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Weak keys with weakness score">
                  {weakKeys.map((w) => (
                    <li
                      key={w.key}
                      className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--text)]"
                    >
                      {w.key.length === 1 && w.key.toLowerCase() !== w.key.toUpperCase()
                        ? w.key.toUpperCase()
                        : w.key}{' '}
                      <span className="text-[var(--warn)]">{Math.round(w.weakness * 100)}%</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  {masteredCount} key{masteredCount === 1 ? '' : 's'} mastered so far.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">
                No weak keys yet — finish a lesson and the coach will map your hot spots here.
              </p>
            )}
          </section>

          <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
            <h2 className="text-sm font-semibold">Today's goal</h2>
            <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--accent)]">
              {doneMinutes.toFixed(1)} <span className="text-sm font-medium text-[var(--muted)]">/ {goalMinutes} min</span>
            </p>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-raised)]"
              role="progressbar"
              aria-label="Practice time toward today's goal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={goalPct}
              aria-valuetext={`${doneMinutes.toFixed(1)} of ${goalMinutes} minutes`}
            >
              <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${goalPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {goalPct >= 100 ? 'Goal met — nicely done.' : `${goalPct}% of the way there.`}
            </p>
          </section>

          <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
            <h2 className="text-sm font-semibold">Progress</h2>
            {trend.length >= 2 ? (
              <div className="mt-3 h-44 w-full" role="img" aria-label="Net words per minute and accuracy over recent sessions">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} />
                    <YAxis stroke="var(--muted)" fontSize={11} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                      labelStyle={{ color: 'var(--text)' }}
                    />
                    <Line type="monotone" dataKey="wpm" name="Net WPM" stroke="var(--accent)" strokeWidth={2} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      name="Accuracy %"
                      stroke="var(--ok)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Complete two sessions to see your trend.
              </p>
            )}
          </section>
          <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]" aria-label="Achievements">
            <h2 className="text-sm font-semibold">Achievements</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {deriveAchievements(coach.sessions).map((a) => (
                <li
                  key={a.id}
                  className={`achievement ${a.earned ? 'achievement-earned' : 'achievement-locked'}`}
                >
                  <span aria-hidden="true" className="font-bold">
                    {a.earned ? '★' : '☆'}
                  </span>
                  <span>
                    <span className="block font-semibold">{a.title}</span>
                    <span className="block text-[0.7rem] text-[var(--muted)]">{a.description}</span>
                  </span>
                  <span className="ml-auto self-center text-[0.6rem] font-semibold uppercase tracking-wide">
                    {a.earned ? 'earned' : 'locked'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
