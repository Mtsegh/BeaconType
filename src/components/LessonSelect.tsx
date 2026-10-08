import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { computeWeakness, recommend } from '@/engine'
import { toSnapshot } from '@/lib/coach'
import type { CoachData, LessonRow } from '../../electron/shared/api'

interface LessonSelectProps {
  lessons: LessonRow[]
  coach: CoachData
  onSelect: (lesson: LessonRow) => void
}

export function LessonSelect({ lessons, coach, onSelect }: LessonSelectProps) {
  const snapshot = toSnapshot(coach)
  const recommendation = recommend(lessons, snapshot)
  const weaknesses = computeWeakness(
    snapshot.keyStats,
    snapshot.recent,
    snapshot.userMedianIntervalMs,
  )
  const weakKeys = weaknesses.filter((w) => !w.mastered && w.attempts > 0 && w.weakness > 0).slice(0, 6)
  const masteredCount = weaknesses.filter((w) => w.mastered).length

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
        <h1 className="text-2xl font-bold tracking-tight">Beacon Type</h1>
        <p className="text-sm text-[var(--muted)]">Pick a transmission to practice. Use the tab key to navigate.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {recommendation && (
            <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--accent)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                Recommended next
              </p>
              <h2 className="mt-1 text-lg font-bold">{recommendation.lesson.id}</h2>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {recommendation.lesson.category}
              </p>
              <p className="mt-2 text-sm">
                <span className="font-semibold">Why this lesson?</span>{' '}
                <span className="text-[var(--muted)]">{recommendation.reason}.</span>
              </p>
              <button
                type="button"
                onClick={() => onSelect(recommendation.lesson)}
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
        </aside>
      </div>
    </div>
  )
}
