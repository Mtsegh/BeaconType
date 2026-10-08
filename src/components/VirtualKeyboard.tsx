import { useEffect, useState } from 'react'

interface KeyDef {
  code: string
  label: string
  wide?: boolean
}

const ROWS: KeyDef[][] = [
  [
    { code: 'Backquote', label: '`' },
    { code: 'Digit1', label: '1' },
    { code: 'Digit2', label: '2' },
    { code: 'Digit3', label: '3' },
    { code: 'Digit4', label: '4' },
    { code: 'Digit5', label: '5' },
    { code: 'Digit6', label: '6' },
    { code: 'Digit7', label: '7' },
    { code: 'Digit8', label: '8' },
    { code: 'Digit9', label: '9' },
    { code: 'Digit0', label: '0' },
    { code: 'Minus', label: '-' },
    { code: 'Equal', label: '=' },
  ],
  [
    { code: 'KeyQ', label: 'q' },
    { code: 'KeyW', label: 'w' },
    { code: 'KeyE', label: 'e' },
    { code: 'KeyR', label: 'r' },
    { code: 'KeyT', label: 't' },
    { code: 'KeyY', label: 'y' },
    { code: 'KeyU', label: 'u' },
    { code: 'KeyI', label: 'i' },
    { code: 'KeyO', label: 'o' },
    { code: 'KeyP', label: 'p' },
    { code: 'BracketLeft', label: '[' },
    { code: 'BracketRight', label: ']' },
    { code: 'Backslash', label: '\\' },
  ],
  [
    { code: 'CapsLock', label: 'Caps', wide: true },
    { code: 'KeyA', label: 'a' },
    { code: 'KeyS', label: 's' },
    { code: 'KeyD', label: 'd' },
    { code: 'KeyF', label: 'f' },
    { code: 'KeyG', label: 'g' },
    { code: 'KeyH', label: 'h' },
    { code: 'KeyJ', label: 'j' },
    { code: 'KeyK', label: 'k' },
    { code: 'KeyL', label: 'l' },
    { code: 'Semicolon', label: ';' },
    { code: 'Quote', label: "'" },
    { code: 'Enter', label: 'Enter', wide: true },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', wide: true },
    { code: 'KeyZ', label: 'z' },
    { code: 'KeyX', label: 'x' },
    { code: 'KeyC', label: 'c' },
    { code: 'KeyV', label: 'v' },
    { code: 'KeyB', label: 'b' },
    { code: 'KeyN', label: 'n' },
    { code: 'KeyM', label: 'm' },
    { code: 'Comma', label: ',' },
    { code: 'Period', label: '.' },
    { code: 'Slash', label: '/' },
    { code: 'ShiftRight', label: 'Shift', wide: true },
  ],
  [
    { code: 'ControlLeft', label: 'Ctrl' },
    { code: 'AltLeft', label: 'Alt' },
    { code: 'Space', label: 'Space', wide: true },
    { code: 'AltRight', label: 'Alt' },
    { code: 'ControlRight', label: 'Ctrl' },
  ],
]

// Physical-key highlighting uses event.code (layout-aware) while scoring uses
// event.key (character-accurate). See src/engine/input.ts.
export function VirtualKeyboard() {
  const [activeCode, setActiveCode] = useState<string | null>(null)

  useEffect(() => {
    const down = (e: KeyboardEvent) => setActiveCode(e.code)
    const up = () => setActiveCode(null)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', up)
    }
  }, [])

  return (
    <div
      role="img"
      aria-label="Virtual keyboard showing the physical key you pressed"
      className="flex flex-col items-center gap-0.5"
    >
      {ROWS.map((row, i) => (
        <div key={i} className="flex items-center justify-center">
          {row.map((k) => (
            <span
              key={k.code}
              className={`kbd${k.wide ? ' kbd-wide' : ''}${activeCode === k.code ? ' kbd-active' : ''}`}
            >
              {k.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}