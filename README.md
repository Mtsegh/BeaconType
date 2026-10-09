# Beacon Type

Beacon Type is a desktop typing coach for people who want to learn proper touch typing. I built it around one idea: the next lesson should be shaped by the keys you actually struggle with, not by a fixed list you march through in order.

## The problem

**Fixed drills ignore your weak keys.** Most typing tutors I tried give you a set lesson and move on. They don't watch which keys you fumble and build the next drill around them, so you keep practicing what you're already good at right alongside what you're not.

**Naive weak-key scoring is noisy.** When a tool does track per-key errors, a key you've typed twice can look awful. One miss in two attempts reads as a 50% error rate, so rarely seen keys jump to the top of every recommendation and drown out the keys that genuinely slow you down.

**Nothing teaches the finger.** A list of letters on screen doesn't tell you which finger should reach them, and highlighting the next key quietly encourages you to look down at your hands. That is the exact habit touch typing is meant to break.

**The typing surface stutters.** Rewriting the whole passage on every keypress is easy to write and easy to feel. Input latency is the one thing a typing app cannot get wrong.

**History is easy to lose or distrust.** If you change a scoring formula, old charts stop meaning what they used to. If the database lives next to the executable, or an update moves it, your history can vanish. Moving progress to a new machine is usually manual or impossible.

**"Adaptive AI" promises are unverifiable.** A model trained on one person learns from one example per session, which is slow and noisy by nature. Products that claim the model adapts to you rarely show you whether it actually helps.

## How this project solves it

**A smoothed weakness score picks the lesson.** The coach lives in `src/engine/coach.ts` as pure TypeScript. It scores each key with `weakness = 0.55·err + 0.25·slow + 0.20·recent`. The error term uses a Laplace-style prior, `(errors + 1) / (attempts + 20)`, so a key with a couple of attempts lands near the roughly 5% baseline instead of at 50%. A key counts as mastered once accuracy stays at or above 95% over 40 attempts and its median interval is within 25% of your own median. Lessons prefer a mix of about 65% weak keys and the rest mastered or unseen, and the app tells you why it chose: "slower responses on R, T and E" or "more mistakes on G and H."

**The finger guide shows the finger, not the key.** Because `HandGuide` teaches which hand and finger to use, it stays useful even when the keyboard is hidden. The keyboard has three modes: `always`, `fade` (dims after 6 seconds), and `no-peek` (no keyboard at all). The expected key and the pressed key are both matched by physical code, so the outlines stay correct on non-QWERTY layouts while scoring still follows the character you typed.

**The passage updates without re-rendering.** `LessonPlayer` writes character classes imperatively through refs as you type, and the beacon and slowdown hint only call `setState` when their value actually changes. The per-keystroke path does no full re-render and no unnecessary allocation.

**Raw events are the source of truth.** Every session stores its `formula_version` and the full stream of keystrokes in `keystroke_events`, with `key_stats` kept only as a rebuildable cache. When I change a formula, I can recompute history instead of losing it. The database lives under the app's `userData` folder, not beside the executable, uses WAL mode, and migrates itself on startup (six migrations so far). Time is stored as wall-clock epoch, so sessions group correctly by calendar day.

**Backup is a real file, not a promise.** Settings has export and import to a JSON file, with a hand-written validator in `electron/shared/backup.ts` so the sandboxed preload doesn't need a schema library. Restoring replaces your sessions, events, key stats, settings and shadow log in a single transaction, while app-managed data like lessons stays put.

**The model runs in shadow mode, and it reports honestly.** A logistic regression written from scratch in `src/engine/ml.ts` trains on consecutive session pairs: the features of one session predict whether the session after it hit the 95% accuracy target. It never predicts a session from itself. Until there are at least 10 examples it stays off. Once it trains, it logs its own pick and its prediction for the rule engine's pick side by side, and the app shows agreement, a Brier score, and pending outcomes. It can only steer the recommendation when you turn on "Adaptive coach" and its pick is at least 70% likely and at least 5 points safer than the rule pick. Otherwise the rules stay in charge. Nothing about the model is persisted; it rebuilds from sessions and the log.

## What works well

- **The engine is testable without Electron.** Typing logic, metrics, the coach and the model are pure TypeScript with no DOM, storage or Electron imports, and run headless in Vitest. There are 94 tests across metrics, input, the coach, the shared library, the model, backup validation and migrations.
- **Security defaults are on, not retrofitted.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a strict CSP, denied `will-navigate`, external links only through an HTTPS allowlist, and every IPC payload validated with Zod before it touches SQL.
- **The native module is proven where it matters.** `better-sqlite3` is built for N-API and confirmed to load in a packaged installer, which is the packaging trap that usually shows up late.
- **Lesson content can't quietly lie.** A migration test enforces that every lesson's `target_keys` actually appear in its text, so the coach never targets a letter the drill doesn't use.
- **Accessibility and pedagogy came first.** Color tokens with high contrast, a reduced-motion setting, adjustable font size, sound and voice toggles, keyboard navigation, and errors marked by shape and underline, not color alone. The beacon is ambient feedback only; it is never the sole error signal.

## Getting started

Requirements: Node.js and npm.

```sh
npm install       # install dependencies
npm run dev       # start Vite plus Electron
npm test          # run the Vitest suite
npm run typecheck # type-check the web and electron projects
npm run lint      # lint electron and src
npm run build     # build the renderer and a Windows installer into release/
```

`better-sqlite3` is a native module, so it must match the Electron version. With N-API prebuilds this is usually transparent, but a broken install may need build tools.
