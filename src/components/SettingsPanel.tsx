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
      </div>
    </section>
  )
}
