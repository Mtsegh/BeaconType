import { useCallback, useEffect, useRef, useState } from 'react'
import { computeMetrics, inferKeystroke } from '@/engine'
import type { ErrorMode, TypingEvent } from '@/engine'
import type { LessonRow } from '../../electron/shared/api'
import type { SessionResult } from '@/lib/session'
import { CharSpan } from './CharSpan'
import { VirtualKeyboard } from './VirtualKeyboard'

interface LessonPlayerProps {
  lesson: LessonRow
  mode: ErrorMode
  onComplete: (result: SessionResult) => void
}

interface PlayerState {
  idx: number
  events: TypingEvent[]
  startedAt: number
  done: boolean
}

export function LessonPlayer({ lesson, mode, onComplete }: LessonPlayerProps) {
  const passage = lesson.content
  const [progress, setProgress] = useState(0)
  const refs = useRef(new Map<number, HTMLSpanElement>())
  const state = useRef<PlayerState>({ idx: 0, events: [], startedAt: 0, done: false })

  const register = useCallback((index: number, el: HTMLSpanElement | null) => {
    if (el) refs.current.set(index, el)
    else refs.current.delete(index)
  }, [])

  useEffect(() => {
    const s = state.current
    s.idx = 0
    s.events = []
    s.startedAt = performance.now()
    s.done = false
    refs.current.get(0)?.classList.add('char-current')

    const onKeyDown = (e: KeyboardEvent) => {
      const s = state.current
      if (s.done || s.idx >= passage.length) return

      const keystroke = inferKeystroke(e)
      if (!keystroke) return

      const now = performance.now()
      const idx = s.idx
      const expected = passage[idx]
      const correct = keystroke.char === expected

      s.events.push({
        idx,
        expected,
        typed: keystroke.char,
        tMs: Math.round(now - s.startedAt),
        correct,
      })

      const span = refs.current.get(idx)
      span?.classList.remove('char-current')
      span?.classList.add(correct ? 'char-correct' : 'char-error')

      const next = idx + 1
      refs.current.get(next)?.classList.add('char-current')
      s.idx = next
      setProgress(next)

      if (next >= passage.length) {
        s.done = true
        const metrics = computeMetrics({
          startedAt: s.startedAt,
          durationMs: Math.round(now - s.startedAt),
          passage,
          mode,
          events: s.events,
        })
        onComplete({ lessonId: lesson.id, mode, startedAt: s.startedAt, metrics, perKey: [], events: s.events })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [passage, mode, lesson.id, onComplete])

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--accent)]">{lesson.category}</p>
        <p className="text-sm text-[var(--muted)]">
          {progress}/{passage.length}
        </p>
      </div>

      <div className="passage" role="textbox" aria-label="Lesson text to type" aria-readonly="true">
        {Array.from(passage).map((char, i) => (
          <CharSpan key={i} char={char} index={i} register={register} />
        ))}
      </div>

      <div className="mt-auto">
        <VirtualKeyboard />
      </div>
    </div>
  )
}