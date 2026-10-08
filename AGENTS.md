# AGENTS.md

## Repo status

- The single source of truth for *what* to build is `ProjectDescription.md` — read it fully before writing code.
- The scaffold has landed: Electron + Vite (`vite-plugin-electron`) + React + TypeScript + Tailwind v4 + `better-sqlite3`. Phase 0 (packaged skeleton), Phase 1 (engine + one lesson + results) and Phase 2 (rule-based adaptive coach, lesson categories, progress/daily goal) are implemented and verified.
- Package manager: **npm only** (no pnpm/yarn). `package-lock.json` is committed.

## Verified commands (run in this order before any commit)

```sh
npm run typecheck   # tsc --noEmit for both tsconfig.json (web) and tsconfig.node.json (electron/configs)
npm run lint        # eslint electron src --max-warnings 0
npm test            # vitest run (34 engine tests: 13 metrics/input + 21 coach); pretest rebuilds dist-electron first
npx playwright test # e2e smoke (needs `npm run pretest` first if dist-electron is stale)
npm run build       # vite build + electron-builder NSIS installer -> release/0.1.0/
```

All five were green as of the Phase 2 gate (2026-10-08). The packaged gate:
launch `release/0.1.0/win-unpacked/Beacon Type.exe`, then confirm
`%APPDATA%\Beacon Type\beacontype.db` reaches `schema_migrations` v3
(`initial-schema`, `seed-lessons`, `coach-lessons-and-profile`) with 9 lessons
and a `user_profile` row. An existing v2 database must upgrade in place.

## Locked decisions (do not re-litigate)

- **Electron**, explicitly not Tauri. Vite + electron-builder, React + TypeScript, Tailwind + Framer Motion, `better-sqlite3` (main process), Recharts, Vitest (engine) + Playwright (UI). Implementation uses `vite-plugin-electron/multi-env` (not the `electron-vite` package).
- Product name "Beacon Type" is provisional — trademark search required before committing.

## Constraints that are easy to get wrong

- **Typing engine is pure TS in the renderer** — no Electron or storage imports. DB access only via a typed preload `contextBridge` API (`saveSession()`, `getKeyStats()`, ...). This keeps the engine unit-testable outside Electron.
- **Security defaults are required:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (meta tag in `index.html`; the `devCSP` plugin swaps in a looser policy *only* under `npm run dev`), external links only via `shell.openExternal` allowlist, `will-navigate` denied.
- **Sandboxed preloads must be CJS** — the preload builds to `dist-electron/preload/index.cjs`. Do not convert it to ESM.
- **The renderer is a plain web app.** It must not import from `electron/` (type-only imports of `electron/shared/api.ts` are fine) and must reach storage exclusively through `window.btAPI`.
- **`better-sqlite3` is a native module** — proven to load in a *packaged* build (Phase 0). `electron-builder.json` sets `"npmRebuild": false`: v13 ships N-API prebuilds, and this machine has no MSVC build tools, so never re-enable npm rebuild.
- **DB lives under `app.getPath('userData')`**, WAL mode, startup migrations (`openDb(MIGRATIONS)` runs at `app.whenReady`, before the window). Migrations table is `schema_migrations`. Never next to the executable (read-only / lost on update).
- **`keystroke_events` is the source of truth; `key_stats` is a rebuildable cache.** Every session stores `formula_version`. Never store only derived metrics — formulas will change.
- **Input handling:** `event.key` for scoring, `event.code` for key highlighting (using one breaks either non-QWERTY layouts or the highlight). Ignore `event.repeat`, handle IME/dead keys, time with `performance.now()`.
- **Per-key errors attribute to the expected key**, not the mistyped one.
- **Adaptive coach (Phase 2) lives in `src/engine/coach.ts`** — pure TS with unit tests. ALL tunable numbers are in the single `COACH_CONFIG` object (weights 0.55/0.25/0.20, smoothing, mastery thresholds, slow-down floor); tune there, never inline. `weakness = 0.55·err + 0.25·slow + 0.20·recent`, with smoothing `(errors+1)/(attempts+20)`.
- **Renderer coach data comes from one IPC call**, `getCoach()` — key stats, decay-weighted recent per-key errors, the user's overall median interval, session summaries and the daily goal. The renderer maps it to the engine's `CoachSnapshot` via `src/lib/coach.ts`; the engine never imports electron/shared.
- **`key_stats.median_interval_ms` is the latest session's median** (only overwritten with ≥3 interval samples); `attempts`/`errors` accumulate; `streak` is the trailing correct run within the last session. The cache stays rebuildable from `keystroke_events`.
- **`sessions.started_at` is wall-clock epoch ms** (`Date.now() - durationMs` at save). The in-memory `startedAt` is a `performance.now()` stamp — never store it directly (Phase 1 did; those legacy rows just never count as "today").
- **Performance rule:** never re-render the full passage per keystroke — `LessonPlayer` updates char DOM imperatively via refs. Input latency is the one thing a typing app cannot get wrong. State changes (slow-down hint, progress counter) must only fire when a value actually changes.
- **Adaptive coach weights** live in one config object — see the coach bullet above.
- ML model stays shadow-mode and optional; rules remain the fallback.

## Environment gotchas (this machine)

- **Port 5173 may be taken** by another project's dev server; Vite then binds 5174. When verifying dev-mode behavior, confirm the port from the `npm run dev` output — probing 5173 can hit a foreign app.
- **electron-builder can fail with `EPERM` renaming `win-unpacked.tmp` → `win-unpacked`** (Defender holds the freshly extracted binaries briefly; no admin rights to add an exclusion). Fix: sleep ~3 s, `Move-Item win-unpacked.tmp win-unpacked`, run `npx electron-builder` again — usually a few attempts are needed (up to 6 observed). **Do not check success by installer existence** — a stale installer from an earlier build survives failed attempts; compare `LastWriteTime` against a timestamp taken before the build started. Bare `npx electron-builder` also does NOT run `vite build` — use `npm run build` when renderer sources changed.
- **NTFS is case-insensitive:** `beacontype` and `BeaconType` are the same directory. Never `Remove-Item` a repo path with different casing — it happened once already.
- **Git identity is not configured globally.** Commit with inline config: `git -c user.email=dev@local -c user.name=beacontype-dev commit ...`.
- **Packaged and dev/e2e userData paths:** the packaged app uses `%APPDATA%\Beacon Type\`; non-packaged Electron (Playwright e2e, `npm run dev`) uses `%APPDATA%\Electron\` — both hold a `beacontype.db`. There is no `%APPDATA%\beacontype\`.

## UX invariants

- During a live lesson show only what helps typing — charts and rewards belong on the results screen.
- Errors default to "continue with the error marked" (stop-on-error is an option); record the mode with each session.
- Accessibility (color tokens, reduced motion, keyboard nav, non-color-only feedback) is built from Phase 1, not retrofitted.

## Recommended build order

Packaged skeleton → engine + tests → rule-based coach → experience layer → ML experiment → signed release.
