import { memo } from 'react'

interface CharSpanProps {
  char: string
  index: number
  register: (index: number, el: HTMLSpanElement | null) => void
}

// Memoized so a keystroke never re-renders the passage wide; state changes
// on the DOM node itself (see LessonPlayer) are the only per-keystroke cost.
// The .passage container uses white-space: pre-wrap, so literal spaces stay
// visible and text still wraps at word boundaries.
export const CharSpan = memo(function CharSpan({ char, index, register }: CharSpanProps) {
  const isSpace = char === ' '
  return (
    <span
      ref={(el) => register(index, el)}
      className="char"
      style={isSpace ? { paddingLeft: '0.5em', paddingRight: '0.5em' } : undefined}
      aria-hidden="true"
    >
      {char}
    </span>
  )
})