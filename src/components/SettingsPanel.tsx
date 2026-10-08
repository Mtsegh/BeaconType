import { useState } from 'react'
import type { FontSize, KeyboardMode, UISettings } from '@/lib/settings'

interface SettingsPanelProps {
  settings: UISettings
  onChange: (patch: Partial<UISettings>) => void
  onClose: () => void
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--muted)]">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 flex-none accent-[var(--accent-strong)]"
      />
    </label>
  )
}

function RadioRow<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <fieldset className="mt-3 border-t border-[var(--border)] pt-3">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--muted)]">
            <input
              type="radio"
              name={legend}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="h-3.5 w-3.5 accent-[var(--accent-strong)]"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  const supportsVoice = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [dataStatus, setDataStatus] = useState<string | null>(null)
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null)

  const handleExport = async () => {
    setDataStatus(null)
    const result = await window.btAPI.exportBackup()
    if (result.ok) setDataStatus(`Backup saved to ${result.path}`)
    else if (!result.canceled) setDataStatus(`Export failed: ${result.error}`)
  }

  const handleImport = async () => {
    setDataStatus(null)
    const confirmed = window.confirm(
      'Restoring a backup replaces ALL current progress, settings and stats with the file contents. Continue?',
    )
    if (!confirmed) return
    const result = await window.btAPI.importBackup()
    if (result.ok) {
      setDataStatus('Backup restored. Reloading…')
      window.location.reload()
    } else if (!result.canceled) {
      setDataStatus(`Restore failed: ${result.error}`)
    }
  }

  const handleCopyDiagnostics = async () => {
    setFeedbackStatus(null)
    try {
      const [health, coach] = await Promise.all([window.btAPI.health(), window.btAPI.getCoach()])
      const text = [
        `Beacon Type ${health.appVersion}`,
        `schema v${health.schemaVersion}`,
        `sessions: ${coach.sessions.length}`,
        `platform: ${navigator.platform}`,
        `db: ${health.dbPath}`,
      ].join('\n')
      await navigator.clipboard.writeText(text)
      setFeedbackStatus('Diagnostics copied — paste them into your message.')
    } catch {
      setFeedbackStatus('Could not access the clipboard.')
    }
  }

  return (
    <section
      aria-label="Settings"
      className="glass rounded-xl p-5 ring-1 ring-[var(--border)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          Close
        </button>
      </div>

      <div className="mt-2 divide-y divide-[var(--border)]">
        <div className="pb-1">
          <Toggle
            label="Sound effects"
            hint="Soft tick per key, a blip on errors, a chime at the end."
            checked={settings.sound}
            onChange={(next) => onChange({ sound: next })}
          />
          {supportsVoice && (
            <Toggle
              label="Spoken summary"
              hint="Read the results aloud when a session finishes."
              checked={settings.voice}
              onChange={(next) => onChange({ voice: next })}
            />
          )}
          <Toggle
            label="Reduced motion"
            hint="Stops the beacon breathing and fades animations."
            checked={settings.reducedMotion}
            onChange={(next) => onChange({ reducedMotion: next })}
          />
          <Toggle
            label="Adaptive Coach (shadow model)"
            hint="Lets the local model steer lessons only when it is clearly safer. Rules stay the fallback."
            checked={settings.adaptiveCoach}
            onChange={(next) => onChange({ adaptiveCoach: next })}
          />
        </div>

        <RadioRow<KeyboardMode>
          legend="Keyboard during lessons"
          value={settings.keyboardMode}
          onChange={(next) => onChange({ keyboardMode: next })}
          options={[
            { value: 'always', label: 'Always visible' },
            { value: 'fade', label: 'Fades while typing' },
            { value: 'no-peek', label: 'No-peek (hidden)' },
          ]}
        />

        <RadioRow<FontSize>
          legend="Text size"
          value={settings.fontSize}
          onChange={(next) => onChange({ fontSize: next })}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ]}
        />

        <div className="py-3">
          <h3 className="text-sm font-medium">Your data</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Everything is stored on this computer. Export a backup before switching machines.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              Export backup…
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              Import backup…
            </button>
          </div>
          {dataStatus && (
            <p className="mt-2 text-xs text-[var(--muted)]" role="status">
              {dataStatus}
            </p>
          )}
        </div>

        <div className="py-3">
          <h3 className="text-sm font-medium">Feedback</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Copy diagnostics to include when you report a problem or share an idea.
          </p>
          <div className="mt-2">
            <button
              type="button"
              onClick={handleCopyDiagnostics}
              className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              Copy diagnostics
            </button>
          </div>
          {feedbackStatus && (
            <p className="mt-2 text-xs text-[var(--muted)]" role="status">
              {feedbackStatus}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
