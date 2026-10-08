import { describe, it, expect } from 'vitest'
import { inferKeystroke } from './input'
import type { KeyboardEventLite } from './input'

function ev(partial: Partial<KeyboardEventLite>): KeyboardEventLite {
  return { key: 'a', code: 'KeyA', repeat: false, isComposing: false, ...partial }
}

describe('inferKeystroke', () => {
  it('accepts a plain printable key', () => {
    expect(inferKeystroke(ev({ key: 'a', code: 'KeyA' }))).toEqual({ char: 'a', code: 'KeyA' })
  })

  it('ignores event.repeat (held keys)', () => {
    expect(inferKeystroke(ev({ repeat: true }))).toBeNull()
  })

  it('ignores IME composition', () => {
    expect(inferKeystroke(ev({ isComposing: true }))).toBeNull()
  })

  it('ignores non-printable keys (modifiers, dead keys, arrows, backspace)', () => {
    for (const key of ['Shift', 'Dead', 'Backspace', 'ArrowRight', 'Control', 'AltGraph']) {
      expect(inferKeystroke(ev({ key })), key).toBeNull()
    }
  })

  it('scores exactly what was typed (case included)', () => {
    expect(inferKeystroke(ev({ key: 'B', code: 'KeyB' }))!.char).toBe('B')
  })
})