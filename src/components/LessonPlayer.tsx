import { useCallback, useEffect, useRef, useState } from 'react'
import { computeMetrics, inferKeystroke, shouldSuggestSlowDown } from '@/engine'
import type { ErrorMode, TypingEvent } from '@/engine'
import type { LessonRow } from '../../electron/shared/api'
import type { SessionResult } from '@/lib/session'
import type { UISettings } from '@/lib/settings'
import { playCompleteSound, playErrorSound, playKeySound } from '@/lib/audio'
import { BeaconOrb } from './BeaconOrb'
import type { BeaconState } from './BeaconOrb'
import { CharSpan } from './CharSpan'
import { HandGuide } from './HandGuide'
import { VirtualKeyboard } from './VirtualKeyboard'

interface LessonPlayerProps {
  lesson: LessonRow
  mode: ErrorMode
  settings: UISettings
  onComplete: (result: SessionResult) => void
}

interface PlayerState {
  idx: number
  events: TypingEvent[]
  startedAt: number
  done: boolean
}

const BEACON_ERROR_HOLD_MS = 650

export function LessonPlayer({ lesson, mode, settings, onComplete }: LessonPlayerProps) {
  const passage = lesson.content
  const [progress, setProgress] = useState(0)
  const [showSlowDown, setShowSlowDown] = useState(false)
  const [beacon, setBeacon] = useState<BeaconState>('idle')
  const [dimmed, setDimmed] = useState(false)
  const refs = useRef(new Map<number, HTMLSpanElement>())
  const state = useRef<PlayerState>({ idx: 0, events: [], startedAt: 0, done: false })
  const slowDownRef = useRef(false)
  const beaconRef = useRef<BeaconState>('idle')
  const beaconTimer = useRef<number | null>(null)

  // State only flips when the value changes, so the per-keystroke path
  // stays free of redundant renders.
  const setBeaconState = useCallback((next: BeaconState) => {
    if (beaconRef.current !== next) {
      beaconRef.current = next
      setBeacon(next)
    }
  }, [])

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
    slowDownRef.current = false
    setShowSlowDown(false)
    refs.current.get(0)?.classList.add('char-current')

    const updateBeacon = (hadError: boolean) => {
      const recent = s.events.slice(-20)
      const correctCount = recent.filter((e) => e.correct).length
      const base: BeaconState = recent.length >= 5 && correctCount / recent.length >= 0.95 ? 'well' : 'idle'
      if (beaconTimer.current !== null) {
        window.clearTimeout(beaconTimer.current)
        beaconTimer.current = null
      }
      if (hadError) {
        setBeaconState('error')
        beaconTimer.current = window.setTimeout(() => {
          beaconTimer.current = null
          setBeaconState(base)
        }, BEACON_ERROR_HOLD_MS)
      } else {
        setBeaconState(base)
      }
    }

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

      if (settings.sound) {
        if (correct) playKeySound()
        else playErrorSound()
      }

      const span = refs.current.get(idx)
      span?.classList.remove('char-current')
      span?.classList.add(correct ? 'char-correct' : 'char-error')

      const next = idx + 1
      refs.current.get(next)?.classList.add('char-current')
      s.idx = next
      setProgress(next)

      updateBeacon(!correct)

      // State only flips when the suggestion actually changes, so the
      // per-keystroke path stays allocation-free.
      const slow = shouldSuggestSlowDown(s.events)
      if (slow !== slowDownRef.current) {
        slowDownRef.current = slow
        setShowSlowDown(slow)
      }

      if (next >= passage.length) {
        s.done = true
        if (settings.sound) playCompleteSound()
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
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (beaconTimer.current !== null) {
        window.clearTimeout(beaconTimer.current)
        beaconTimer.current = null
      }
    }
  }, [passage, mode, lesson.id, onComplete, settings, setBeaconState])

  // Fade mode: the keyboard dims shortly after the lesson starts; the
  // finger guide stays, so the pedagogy survives without key outlines.
  useEffect(() => {
    if (settings.keyboardMode !== 'fade') return
    const timer = window.setTimeout(() => setDimmed(true), 6000)
    return () => window.clearTimeout(timer)
  }, [settings.keyboardMode])

  const nextChar = progress < passage.length ? passage[progress] : null

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-[var(--accent)]">{lesson.category}</p>
        <BeaconOrb state={beacon} />
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
        <p
          role="status"
          aria-live="polite"
          className="mb-3 min-h-6 text-sm font-medium text-[var(--warn)]"
        >
          {showSlowDown && 'Ease up — let accuracy recover before pushing speed.'}
        </p>
        <div className="mb-4">
          <HandGuide nextChar={nextChar} />
        </div>
        {settings.keyboardMode !== 'no-peek' && (
          <VirtualKeyboard targetChar={nextChar} dimmed={dimmed} />
        )}
      </div>
    </div>
  )
}
