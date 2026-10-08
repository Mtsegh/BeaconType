interface OnboardingProps {
  onStartDiagnostic: () => void
  onSkip: () => void
}

export function Onboarding({ onStartDiagnostic, onSkip }: OnboardingProps) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="glass max-w-lg rounded-xl p-8 text-center ring-1 ring-[var(--border)]">
        <div className="beacon beacon-idle mx-auto" aria-hidden="true" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Welcome to Beacon Type</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          A calm console for learning to touch type. The beacon reacts as you type, and the coach
          steers each lesson toward the keys you find hardest.
        </p>
        <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-[var(--muted)]">
          <li>Keep your eyes on the line — the guide shows which finger to use.</li>
          <li>Accuracy first; speed follows.</li>
          <li>Start with a one-minute diagnostic so the coach can map your hot spots.</li>
        </ul>
        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onStartDiagnostic}
            className="rounded-lg bg-[var(--accent-strong)] px-6 py-3 text-sm font-semibold text-[var(--bg)] transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Run the 60-second diagnostic
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
