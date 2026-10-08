import type { LessonRow } from '../../electron/shared/api'

interface LessonSelectProps {
  lessons: LessonRow[]
  onSelect: (lesson: LessonRow) => void
}

export function LessonSelect({ lessons, onSelect }: LessonSelectProps) {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Beacon Type</h1>
        <p className="text-sm text-[var(--muted)]">Pick a transmission to practice. Use the tab key to navigate.</p>
      </header>

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
  )
}