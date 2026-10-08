import { useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SessionResult } from '@/lib/session'
import type { NextMission } from '@/lib/coach'
import type { UISettings } from '@/lib/settings'
import type { CoachData, LessonRow } from '../../electron/shared/api'
import { Constellation } from './Constellation'

interface ResultsScreenProps {
  result: SessionResult
  saveStatus: 'saving' | 'saved' | 'error'
  next: NextMission | null
  coach: CoachData | null
  settings: UISettings
  onDone: () => void
  onStartNext: (lesson: LessonRow) => void
}

export function ResultsScreen({
  result,
  saveStatus,
  next,
  coach,
  settings,
  onDone,
  onStartNext,
}: ResultsScreenProps) {
  const m = result.metrics
  const chartData = result.perKey
    .filter((k) => k.attempts > 0)
    .slice(0, 8)
    .map((k) => ({ key: k.key, attempts: k.attempts, errors: k.errors }))

  const weakKeys = result.perKey
    .filter((k) => k.errors > 0)
    .slice(0, 3)
    .map((k) => `"${k.key}" (${k.errors} error${k.errors === 1 ? '' : 's'})`)

  // Spoken summary (optional, feature-detected) after the session persists.
  useEffect(() => {
    if (!settings.voice || saveStatus !== 'saved') return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const line = `Session complete. ${result.metrics.netWpm.toFixed(0)} words per minute, ${(
      result.metrics.accuracy * 100
    ).toFixed(0)} percent accuracy.`
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(line)
    window.speechSynthesis.speak(utterance)
    return () => window.speechSynthesis.cancel()
  }, [settings.voice, saveStatus, result])

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Transmission complete</h1>
        <span
          className={`text-xs font-medium ${
            saveStatus === 'saved'
              ? 'text-[var(--ok)]'
              : saveStatus === 'error'
                ? 'text-[var(--danger)]'
                : 'text-[var(--muted)]'
          }`}
          aria-live="polite"
        >
          {saveStatus === 'saving' && 'Saving session…'}
          {saveStatus === 'saved' && 'Session saved locally'}
          {saveStatus === 'error' && 'Failed to save session'}
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Net WPM" value={m.netWpm.toFixed(1)} />
        <Metric label="Accuracy" value={`${(m.accuracy * 100).toFixed(1)}%`} />
        <Metric label="Raw WPM" value={m.rawWpm.toFixed(1)} />
      </div>

      <p className="text-sm text-[var(--muted)]">
        {m.totalKeystrokes} keystrokes · {m.correctKeystrokes} correct · {m.uncorrectedErrors} uncorrected errors
        {m.correctedErrors > 0 && ` · ${m.correctedErrors} corrected`} · {(m.durationMs / 1000).toFixed(1)}s
        {weakKeys.length > 0 && (
          <span className="mt-1 block">
            Watch for <span className="text-[var(--danger)]">{weakKeys.join(', ')}</span> next time.
          </span>
        )}
      </p>

      <div className="h-72 w-full rounded-xl bg-[var(--bg-raised)] p-4 ring-1 ring-[var(--border)]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="key" stroke="var(--muted)" fontSize={12} />
            <YAxis stroke="var(--muted)" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--text)' }}
            />
            <Bar dataKey="attempts" name="Attempts" fill="var(--accent-strong)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="errors" name="Errors" fill="var(--danger)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {coach && <Constellation coach={coach} />}

      {next && (
        <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--accent)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Next mission</p>
          <h2 className="mt-1 text-lg font-bold">{next.lesson.id}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{next.reason}.</p>
          <button
            type="button"
            onClick={() => onStartNext(next.lesson)}
            className="mt-4 rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Start next lesson
          </button>
        </section>
      )}

      <div className="mt-auto">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--bg)] transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          Back to lessons
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--accent)]">{value}</p>
    </div>
  )
}