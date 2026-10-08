export type BeaconState = 'idle' | 'well' | 'error'

const STATE_LABEL: Record<BeaconState, string> = {
  idle: 'Beacon: idle',
  well: 'Beacon: glowing, typing well',
  error: 'Beacon: pulse, recent mistake',
}

interface BeaconOrbProps {
  state: BeaconState
}

// Ambient feedback only — never the sole signal: errors also mark the
// character (wavy underline) and the status line announces slowdowns.
export function BeaconOrb({ state }: BeaconOrbProps) {
  return (
    <div
      role="img"
      aria-label={STATE_LABEL[state]}
      className={`beacon beacon-${state}`}
      data-beacon={state}
    />
  )
}
