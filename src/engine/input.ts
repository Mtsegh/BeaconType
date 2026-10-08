// Keyboard-event → keystroke inference.
//
// Rules (locked in ProjectDescription.md / AGENTS.md):
// - `event.key` is used for scoring the typed character, `event.code` for
//   highlighting the physical key. Using one for both breaks non-QWERTY
//   layouts or the highlight.
// - `event.repeat` is ignored: holding a key must not spam keystrokes.
// - IME composition and dead keys are skipped; the composed character that
//   follows them arrives on a later keydown and is scored then.

export interface KeyboardEventLite {
  key: string
  code: string
  repeat: boolean
  isComposing: boolean
}

export interface Keystroke {
  char: string
  code: string
}

/**
 * Returns the keystroke to record for a keydown, or null when the event
 * should be ignored (repeat, IME composition, modifier/dead/function keys,
 * paste, ...). Uses `key.length === 1` as the printable-character filter.
 */
export function inferKeystroke(e: KeyboardEventLite): Keystroke | null {
  if (e.repeat) return null
  if (e.isComposing) return null
  if (e.key.length !== 1) return null
  return { char: e.key, code: e.code }
}