// Tiny Web Audio synth for key/error/success sounds — no asset files.
// Callers pass the user's sound setting; this module only produces sound.
// The AudioContext is created lazily on the first user gesture (keydown),
// which is also when browsers allow audio to start.

let ctx: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function blip(freq: number, durationMs: number, peak: number, type: OscillatorType, delayMs = 0): void {
  const audio = ensureContext()
  if (!audio) return
  const t0 = audio.currentTime + delayMs / 1000
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + durationMs / 1000 + 0.03)
}

export function playKeySound(): void {
  blip(1500, 45, 0.03, 'triangle')
}

export function playErrorSound(): void {
  blip(220, 150, 0.06, 'triangle')
}

export function playCompleteSound(): void {
  blip(523, 170, 0.07, 'sine', 0)
  blip(659, 170, 0.07, 'sine', 130)
  blip(784, 300, 0.08, 'sine', 260)
}
