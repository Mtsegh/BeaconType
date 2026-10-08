// Touch-typing finger assignments and character → physical-code mapping.
// Pure and layout-descriptive: QWERTY is what we teach, but scoring still
// follows whatever the user's layout produces (see src/engine/input.ts).

export type Finger =
  | 'leftPinky'
  | 'leftRing'
  | 'leftMiddle'
  | 'leftIndex'
  | 'rightIndex'
  | 'rightMiddle'
  | 'rightRing'
  | 'rightPinky'
  | 'thumb'

export const FINGER_LABEL: Record<Finger, string> = {
  leftPinky: 'left pinky',
  leftRing: 'left ring',
  leftMiddle: 'left middle',
  leftIndex: 'left index',
  rightIndex: 'right index',
  rightMiddle: 'right middle',
  rightRing: 'right ring',
  rightPinky: 'right pinky',
  thumb: 'thumb',
}

const KEY_TO_FINGER: Record<string, Finger> = {
  '`': 'leftPinky', '1': 'leftPinky', q: 'leftPinky', a: 'leftPinky', z: 'leftPinky',
  '2': 'leftRing', w: 'leftRing', s: 'leftRing', x: 'leftRing',
  '3': 'leftMiddle', e: 'leftMiddle', d: 'leftMiddle', c: 'leftMiddle',
  '4': 'leftIndex', '5': 'leftIndex', r: 'leftIndex', t: 'leftIndex', f: 'leftIndex', g: 'leftIndex', v: 'leftIndex', b: 'leftIndex',
  '6': 'rightIndex', '7': 'rightIndex', y: 'rightIndex', u: 'rightIndex', h: 'rightIndex', j: 'rightIndex', n: 'rightIndex', m: 'rightIndex',
  '8': 'rightMiddle', i: 'rightMiddle', k: 'rightMiddle', ',': 'rightMiddle',
  '9': 'rightRing', o: 'rightRing', l: 'rightRing', '.': 'rightRing',
  '0': 'rightPinky', '-': 'rightPinky', '=': 'rightPinky', p: 'rightPinky', '[': 'rightPinky', ']': 'rightPinky', ';': 'rightPinky', "'": 'rightPinky', '/': 'rightPinky', '\\': 'rightPinky',
  ' ': 'thumb',
}

// Shifted symbols: which finger presses the base key.
const SHIFTED_TO_FINGER: Record<string, Finger> = {
  '!': 'leftPinky', '@': 'leftRing', '#': 'leftMiddle', $: 'leftIndex', '%': 'leftIndex',
  '^': 'rightIndex', '&': 'rightIndex', '*': 'rightIndex', '(': 'rightMiddle', ')': 'rightRing',
  _: 'rightPinky', '+': 'rightPinky', ':': 'rightPinky', '"': 'rightPinky',
  '<': 'rightMiddle', '>': 'rightRing', '?': 'rightPinky',
  '~': 'leftPinky', '{': 'rightPinky', '}': 'rightPinky', '|': 'rightPinky',
}

/** Finger that types `char` on a standard QWERTY layout, or null if none. */
export function fingerFor(char: string): Finger | null {
  if (!char) return null
  const lower = char.toLowerCase()
  return KEY_TO_FINGER[char] ?? KEY_TO_FINGER[lower] ?? SHIFTED_TO_FINGER[char] ?? null
}

const CHAR_TO_CODE: Record<string, string> = {
  ' ': 'Space',
  '`': 'Backquote', '-': 'Minus', '=': 'Equal',
  '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
  ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash',
  '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', $: 'Digit4', '%': 'Digit5',
  '^': 'Digit6', '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0',
  _: 'Minus', '+': 'Equal',
  '{': 'BracketLeft', '}': 'BracketRight', '|': 'Backslash',
  ':': 'Semicolon', '"': 'Quote', '<': 'Comma', '>': 'Period', '?': 'Slash',
  '~': 'Backquote',
}

/**
 * `event.code`-style physical code for a printable character (case-insensitive
 * for letters), used to highlight the *expected* key on the virtual keyboard.
 * Returns null when the character has no fixed QWERTY position.
 */
export function codeForChar(char: string): string | null {
  if (!char) return null
  const direct = CHAR_TO_CODE[char]
  if (direct) return direct
  const lower = char.toLowerCase()
  if (lower >= 'a' && lower <= 'z') return `Key${lower.toUpperCase()}`
  if (char >= '0' && char <= '9') return `Digit${char}`
  return null
}
