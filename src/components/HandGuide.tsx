import { FINGER_LABEL, fingerFor } from '@/lib/fingers'
import type { Finger } from '@/lib/fingers'

interface HandGuideProps {
  nextChar: string | null
}

interface HomeKey {
  finger: Finger
  home: string
  name: string
}

const LEFT: HomeKey[] = [
  { finger: 'leftPinky', home: 'A', name: 'pinky' },
  { finger: 'leftRing', home: 'S', name: 'ring' },
  { finger: 'leftMiddle', home: 'D', name: 'middle' },
  { finger: 'leftIndex', home: 'F', name: 'index' },
]

const RIGHT: HomeKey[] = [
  { finger: 'rightIndex', home: 'J', name: 'index' },
  { finger: 'rightMiddle', home: 'K', name: 'middle' },
  { finger: 'rightRing', home: 'L', name: 'ring' },
  { finger: 'rightPinky', home: ';', name: 'pinky' },
]

function Capsule({ entry, active }: { entry: HomeKey; active: boolean }) {
  return (
    <span className={`finger${active ? ' finger-active' : ''}`}>
      <span className="finger-home">{entry.home}</span>
      <span className="finger-name">{entry.name}</span>
    </span>
  )
}

// Stylized two-hand diagram: home-key letter + finger name per capsule,
// with the finger for the next expected character highlighted. Shows the
// finger, not the key position, so it stays useful in no-peek mode.
export function HandGuide({ nextChar }: HandGuideProps) {
  const active: Finger | null = nextChar ? fingerFor(nextChar) : null
  const activeText = active ? FINGER_LABEL[active] : ''

  return (
    <div className="flex items-center justify-center gap-6">
      <span className="sr-only" aria-live="polite">
        {active ? `Next key uses the ${activeText}.` : ''}
      </span>
      <div
        className="flex items-end gap-1.5"
        role="img"
        aria-label={`Left hand: pinky on A, ring on S, middle on D, index on F${
          active && active.startsWith('left') ? `. Active: ${activeText}` : ''
        }`}
      >
        {LEFT.map((entry) => (
          <Capsule key={entry.finger} entry={entry} active={active === entry.finger} />
        ))}
      </div>
      <span
        className={`finger finger-thumb${active === 'thumb' ? ' finger-active' : ''}`}
        role="img"
        aria-label={`Space bar uses the thumb${active === 'thumb' ? '. Active: thumb' : ''}`}
      >
        <span className="finger-home">&#9251;</span>
        <span className="finger-name">thumb</span>
      </span>
      <div
        className="flex items-end gap-1.5"
        role="img"
        aria-label={`Right hand: index on J, middle on K, ring on L, pinky on semicolon${
          active && active.startsWith('right') ? `. Active: ${activeText}` : ''
        }`}
      >
        {RIGHT.map((entry) => (
          <Capsule key={entry.finger} entry={entry} active={active === entry.finger} />
        ))}
      </div>
    </div>
  )
}
