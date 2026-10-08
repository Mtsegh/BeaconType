# AGENTS.md

## Repo status

- Plan-only repo. The single source of truth is `ProjectDescription.md` — read it fully before writing code.
- No scaffold, manifests, or commands exist yet. When the build lands, record the exact lint/test/typecheck commands here.

## Locked decisions (do not re-litigate)

- **Electron**, explicitly not Tauri. Vite + Electron Forge or electron-builder, React + TypeScript, Tailwind + Framer Motion, `better-sqlite3` (main process), Recharts, Vitest (engine) + Playwright (UI).
- Product name "Beacon Type" is provisional — trademark search required before committing.

## Constraints that are easy to get wrong

- **Typing engine is pure TS in the renderer** — no Electron or storage imports. DB access only via a typed preload `contextBridge` API (`saveSession()`, `getKeyStats()`, ...). This keeps the engine unit-testable outside Electron.
- **Security defaults are required:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, external links only via `shell.openExternal` allowlist.
- **`better-sqlite3` is a native module** — it must be proven to load in a *packaged* build (Phase 0), not just `electron dev`. This is the classic Electron packaging failure.
- **DB lives under `app.getPath('userData')`**, WAL mode, startup migrations from Phase 1 on. Never next to the executable (read-only / lost on update).
- **`keystroke_events` is the source of truth; `key_stats` is a rebuildable cache.** Every session stores `formula_version`. Never store only derived metrics — formulas will change.
- **Input handling:** `event.key` for scoring, `event.code` for key highlighting (using one breaks either non-QWERTY layouts or the highlight). Ignore `event.repeat`, handle IME/dead keys, time with `performance.now()`.
- **Per-key errors attribute to the expected key**, not the mistyped one.
- **Performance rule:** never re-render the full passage per keystroke (memoized char components or ref-based updates). Input latency is the one thing a typing app cannot get wrong.
- **Adaptive coach weights** live in one config object (they are a starting guess): `weakness = 0.55·err + 0.25·slow + 0.20·recent`, with smoothing `(errors+1)/(attempts+20)`.
- ML model stays shadow-mode and optional; rules remain the fallback.

## UX invariants

- During a live lesson show only what helps typing — charts and rewards belong on the results screen.
- Errors default to "continue with the error marked" (stop-on-error is an option); record the mode with each session.
- Accessibility (color tokens, reduced motion, keyboard nav, non-color-only feedback) is built from Phase 1, not retrofitted.

## Recommended build order

Packaged skeleton → engine + tests → rule-based coach → experience layer → ML experiment → signed release.
