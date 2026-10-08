import { computeWeakness } from '@/engine'
import type { CoachData } from '../../electron/shared/api'

interface ConstellationProps {
  coach: CoachData
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const GOLDEN_ANGLE = 2.399963229728653

interface StarNode {
  key: string
  x: number
  y: number
  mastered: boolean
  practiced: boolean
  weak: boolean
}

// Deterministic sky: every letter a-z gets a stable position (golden-angle
// spiral), so the map grows in place as keys light up.
function layout(weaknesses: ReturnType<typeof computeWeakness>): StarNode[] {
  const byKey = new Map(weaknesses.map((w) => [w.key.toLowerCase(), w]))
  return ALPHA.split('').map((key, i) => {
    const stat = byKey.get(key)
    const attempts = stat?.attempts ?? 0
    const angle = i * GOLDEN_ANGLE
    const radius = 7 + Math.sqrt(i) * 12.5
    return {
      key,
      x: Math.round((150 + Math.cos(angle) * radius * 1.6) * 10) / 10,
      y: Math.round((82 + Math.sin(angle) * radius * 0.9) * 10) / 10,
      mastered: stat?.mastered ?? false,
      practiced: attempts > 0,
      weak: attempts > 0 && !(stat?.mastered ?? false) && (stat?.weakness ?? 0) >= 0.3,
    }
  })
}

export function Constellation({ coach }: ConstellationProps) {
  const nodes = layout(
    computeWeakness(coach.keyStats, coach.recentKeyErrors, coach.userMedianIntervalMs),
  )
  const mastered = nodes.filter((n) => n.mastered)
  const practicedCount = nodes.filter((n) => n.practiced).length
  const path = mastered.map((n) => `${n.x},${n.y}`).join(' ')

  return (
    <section className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--border)]" aria-label="Constellation map of mastered keys">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Constellation</h2>
        <p className="text-xs text-[var(--muted)]">
          {mastered.length} of 26 mastered
        </p>
      </div>

      <div className="mt-3">
        <svg
          viewBox="0 0 300 165"
          className="h-40 w-full"
          role="img"
          aria-label={`${mastered.length} of 26 keys mastered, ${practicedCount} practiced`}
        >
          {mastered.length >= 2 && (
            <polyline
              points={path}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          )}
          {nodes.map((n) => {
            if (n.mastered) {
              return (
                <g key={n.key}>
                  <circle cx={n.x} cy={n.y} r="9" fill="var(--accent)" fillOpacity="0.14" />
                  <circle cx={n.x} cy={n.y} r="4.5" fill="var(--accent)" />
                  <text
                    x={n.x}
                    y={n.y - 11}
                    textAnchor="middle"
                    fontSize="8"
                    fill="var(--text)"
                    fontWeight="700"
                  >
                    {n.key}
                  </text>
                </g>
              )
            }
            if (n.weak) {
              return (
                <g key={n.key}>
                  <circle cx={n.x} cy={n.y} r="4" fill="none" stroke="var(--danger)" strokeWidth="1.5" />
                  <circle cx={n.x} cy={n.y} r="1.5" fill="var(--danger)" />
                </g>
              )
            }
            if (n.practiced) {
              return <circle key={n.key} cx={n.x} cy={n.y} r="3" fill="var(--accent)" fillOpacity="0.55" />
            }
            return <circle key={n.key} cx={n.x} cy={n.y} r="1.5" fill="var(--border)" />
          })}
        </svg>
      </div>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-[var(--muted)]">
        <li>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          mastered (40+ attempts, 95%+ accuracy)
        </li>
        <li>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full border border-[var(--danger)]" />
          weak spot
        </li>
        <li>
          <span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--border)]" />
          not seen yet
        </li>
      </ul>
      {practicedCount === 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">Finish a lesson to start your constellation.</p>
      )}
    </section>
  )
}
