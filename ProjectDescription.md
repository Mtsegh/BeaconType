# Beacon Type: revised plan (Electron edition)

An original typing coach inspired by classic typing tutors. It uses its own name, lessons and art, and nothing from Mavis Beacon's branding. Do a quick trademark search on "Beacon Type" before you commit to the name.

**Core loop:** Warm-up → Adaptive lesson → Live feedback → Results → Next mission

## What changed from the first version, and why

| Change | Why |
|---|---|
| Tauri → **Electron** | Matches your decision. It also bundles its own Chromium, so rendering, keyboard events and speech behave the same on every OS. The cost is a larger installer (roughly 100 MB or more). |
| Renderer written as a **plain web app** behind a storage interface | You can iterate in a browser with fast reloads, and swapping the storage layer later costs one file. |
| Typing engine and metrics **fully specified** | It's the core of the app. Undefined formulas mean history you can't trust. |
| Weakness score **smoothed and normalized** | Without smoothing, rarely used keys with tiny samples jump to the top of every lesson. |
| ML experiment given a **real training label** | The original had nothing to learn from. |
| **Raw keystroke events stored**, migrations in Phase 1 | Your formulas will change, and raw events let you recompute history. |
| Accessibility and pedagogy moved **earlier** | Both are expensive to retrofit. |
| Realistic timelines and signing | Native modules and code signing are the usual Electron time sinks. |

## Tech stack

| Area | Choice | Reason |
|---|---|---|
| Desktop shell | Electron | Bundled Chromium gives you identical behavior everywhere, and everything is JS/TS. |
| Build tooling | Vite + Electron Forge or electron-builder | Fast dev loop, and both handle packaging and installers. |
| UI | React + TypeScript | Typed state and fast iteration. |
| Styling/animation | Tailwind CSS + Framer Motion | Rich visuals without much custom CSS. |
| Local database | SQLite via `better-sqlite3` (main process) | Synchronous, fast and reliable for local data. |
| Charts | Recharts | WPM, accuracy and weak-key visuals. |
| Sound | Web Audio API | Keystroke and success sounds. |
| Voice (optional) | `speechSynthesis` | Spoken feedback. It depends on the OS voices installed, and on Linux it needs speech-dispatcher, so feature-detect it and hide the toggle if it's missing. |
| Testing | Vitest (engine) + Playwright (UI) | The engine is pure logic, so it's very testable. |

**Why `better-sqlite3`:** It's a native module, so it must be built against Electron's Node version. This is the classic Electron packaging pitfall, so Phase 0 includes proving it works in a *packaged* build, not just in dev.

## Process architecture and security

```text
Main process (Node)
  ├─ Window management, app lifecycle
  ├─ SQLite access (better-sqlite3, WAL mode)
  ├─ Backups and export
  └─ IPC handlers (validated inputs)

Preload script
  └─ contextBridge exposes a small typed API:
     saveSession(), getKeyStats(), getSettings(), ...

Renderer (React, no Node access)
  ├─ Lesson player + virtual keyboard
  ├─ Typing engine (pure TS, no UI dependencies)
  ├─ Adaptive coach
  ├─ Beacon animations
  └─ Results, charts, settings
```

- Set `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`, and add a strict Content Security Policy.
- Open external links only through `shell.openExternal` with an allowlist.
- **Why:** The app loads only your own content, so it's low-risk today. These defaults cost almost nothing and prevent a whole class of problems if you ever add remote content or links.
- The typing engine lives in the renderer and knows nothing about Electron. The database sits behind the preload API. **Why:** You can unit-test the engine without Electron, and you could run the renderer in a browser or swap storage later without touching the logic.
- Store the database under `app.getPath('userData')`, not next to the executable. **Why:** Installed app folders are often read-only, and user data must survive updates.

## Product and UX

**Creative direction:** a calm sci-fi training console, not a corporate dashboard.

- Dark midnight background, glass panels, soft neon light.
- A central beacon/orb with states: idle (breathing glow), typing well (brighter), errors (subtle pulse, never alarming), session complete (expands into a progress constellation).
- Lesson text floats in a focused "transmission" panel, with a virtual keyboard below it.
- Progress becomes a constellation map where each mastered skill lights a node.

**Rule:** during a live lesson, show only what helps the user type. Save charts and rewards for the results screen.

**Pedagogy decisions (new):**

- **Hideable keyboard.** Highlighting the target key encourages looking down. Let the keyboard fade out as lessons progress, with a "no-peek" mode. *Why:* Looking at the keys works against learning to touch type.
- **Error mode.** Default to "continue with the error marked," with a stop-on-error option for beginners. *Why:* This changes your metrics and the user experience, so pick it deliberately and record the mode with each session.
- **Finger guidance.** Include a hand/finger diagram per key. *Why:* Correct finger assignment is the main thing a tutor teaches that plain practice doesn't.

**Performance rule:** don't re-render the whole passage per keystroke. Render characters as memoized components, or update state by ref. Keep glass blur and heavy animation off the typing surface. *Why:* Input latency is the one thing a typing app can't get wrong.

## Typing engine specification

**Input handling:**

- Use `event.key` for scoring (which character was typed) and `event.code` for highlighting the physical key. *Why:* Using only one breaks either non-QWERTY layouts or the highlight.
- Ignore `event.repeat`, and handle dead keys and IME composition.
- Use `performance.now()` for timing. *Why:* It's high-resolution and monotonic.

**Metrics (pick these and store a `formula_version`):**

```text
rawWPM  = (totalKeystrokes / 5) / minutes
netWPM  = (correctCharsInFinalText / 5) / minutes
accuracy = correctKeystrokes / totalKeystrokes
```

Track corrected and uncorrected errors separately. *Why:* A formula you can't reproduce makes progress charts meaningless, and the version tag lets you migrate when you change it.

**Per-key stats:**

- Attribute each error to the **expected** key, not the wrong key typed. *Why:* You're finding which keys the user struggles to reach.
- Compute speed from the interval after a *correct* previous keystroke, and compare it to the user's overall median interval. *Why:* Raw time per key mostly reflects awkward letter pairs and general speed, not the key itself.

## Data model

```text
user_profile      (id, level, layout, goals, daily_minutes, created_at)
sessions          (id, started_at, lesson_id, mode, net_wpm, raw_wpm,
                   accuracy, duration_ms, formula_version)
keystroke_events  (session_id, idx, expected, typed, t_ms, correct)
key_stats         (key, attempts, errors, median_interval_ms,
                   streak, updated_at)       -- derived, rebuildable
lessons           (id, category, content, target_keys)
settings          (key, value)
schema_migrations (version, applied_at)
```

- Run migrations at startup from Phase 1. *Why:* Every installed copy needs a safe upgrade path, and retrofitting this later risks corrupting user data.
- Treat `key_stats` as a cache that can be rebuilt from `keystroke_events`. *Why:* When you change the weakness formula, you recompute instead of losing history. A five-minute session is only about 1,500 events, so storage is trivial.
- Enable WAL mode and use `better-sqlite3`'s backup API for exports and backups. *Why:* This gives crash-safe writes and consistent backup files.

## Adaptive coach

Start with the deterministic engine. It's easy to debug and already feels intelligent.

```text
errorRate_k = (errors_k + 1) / (attempts_k + 20)      // smoothed, ~5% prior
err_k       = min(errorRate_k / 0.25, 1)              // scaled to 0–1
slow_k      = clamp(keyMedian_k / userMedian - 1, 0, 1)
recent_k    = decay-weighted errors over recent sessions, scaled 0–1

weakness_k  = 0.55·err_k + 0.25·slow_k + 0.20·recent_k
```

- The smoothing term makes a key with 2 attempts and 1 error land near the prior instead of at "50% error." *Why:* It keeps rarely seen keys from hijacking lessons.
- The weights are a starting guess, so tune them with real sessions. Keep them in one config object.
- Each lesson emphasizes the top weak keys (around 60 to 70%) and mixes in mastered keys so practice stays natural.
- Add a mastery rule, such as "accuracy ≥ 95% and speed target met over the last N attempts." *Why:* Mastery-based progression is the proven mechanism in tutors, and it gives the coach a clear way to decide what to do next.
- Provide "Why this lesson?" explanations, for example "slower responses on R, T and E."
- Offer a gentle "slow down" suggestion if accuracy collapses mid-lesson.

## Tiny ML experiment (after the MVP)

**Goal:** educational. It's a transparent model to compare against the rules, not a replacement.

- **Label:** after each session, record whether the *next* session met the accuracy target and was completed. Define "challenge was right-sized" from that.
- **Inputs (normalized to the user's own baseline):** accuracy, relative speed, recent error rate, session length, key difficulty. *Why:* Raw WPM isn't comparable between users.
- **Model:** start with logistic regression or a very small network written from scratch. Be ready to find that two hidden neurons add nothing over logistic regression.
- **Mode:** run in shadow mode first (log its recommendation next to the rule engine's), and only influence lessons if it clearly agrees or helps.
- Keep it optional ("Adaptive Coach: On/Off"), keep the rules as the fallback, and don't claim it infers anything beyond lesson difficulty.

**Why this design:** One user produces one training example per session, so learning will be slow and noisy. The shadow comparison tells you honestly whether it's useful. Don't promise that adaptive beats fixed lessons unless you set up a proper comparison, which is hard with few users.

## Accessibility (from the start)

- Color tokens with a high-contrast palette, a reduced-motion setting, adjustable font sizes, and sound/voice toggles.
- Never use color as the only feedback (add shape, underline or icon for errors).
- Full keyboard navigation of menus and screens.
- **Why now:** Retrofitting contrast and motion settings across finished components is far more work than starting with tokens and a motion flag.

## Roadmap

### Phase 0: Skeleton (2–3 days)
- Electron + Vite + React + TypeScript scaffold with the security defaults above.
- Preload API and one IPC call, round-tripping to SQLite.
- **Build a packaged installer early** and confirm `better-sqlite3` loads in it. *Why:* It's the biggest Electron surprise, and finding it in week one is cheap.

### Phase 1: Typing engine (1–2 weeks)
- Input capture, metrics, event log and migrations.
- One typing screen, one results page, sessions saved.
- Unit tests for WPM, accuracy and per-key stats (use fixed keystroke fixtures).
- Accessibility tokens and the reduced-motion flag.

### Phase 2: Useful tutor (2 weeks)
- Lesson categories (home row, key drills, common words, punctuation, numbers, passages).
- Per-key tracking, rule-based selection, mastery rule and "why this lesson?"
- Progress charts and daily goals.
- Test with several people and tune.
- Passage text from public-domain sources (e.g. Project Gutenberg) or your own writing.

### Phase 3: Distinctive experience (1–2 weeks)
- Beacon visuals, animated keyboard with the hide/fade option, finger guide, sounds, themes, achievements.
- Onboarding with a one-minute diagnostic and empty states.

### Phase 4: ML experiment (about 1 week)
- Shadow-mode model, logging and comparison view.

### Phase 5: Release (1+ week)
- Windows installer first.
- **Code signing:** unsigned Windows builds trigger SmartScreen warnings, macOS needs signing and notarization, and auto-update needs signed builds.
- Backup/export, a small in-app feedback loop, and a migration test.

These are rough estimates, and I've widened them because the first version was optimistic.

## Success metrics

- WPM and accuracy improvement over 7 and 30 days
- Reduction in weak-key error rates
- Practice consistency and lesson completion rate
- Rules vs. shadow-model agreement (and, if you can run it, adaptive vs. fixed lessons)

**Recommended order:** packaged skeleton → engine and tests → rule-based coach → experience layer → ML experiment → signed release.
