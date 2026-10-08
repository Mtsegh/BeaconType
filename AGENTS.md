# AGENTS.md

## Repo status

- The single source of truth for *what* to build is `ProjectDescription.md` — read it fully before writing code.
- The scaffold has landed: Electron + Vite (`vite-plugin-electron`) + React + TypeScript + Tailwind v4 + `better-sqlite3`. Phase 0 (packaged skeleton), Phase 1 (engine + one lesson + results), Phase 2 (rule-based adaptive coach, lesson categories, progress/daily goal), Phase 3 (experience layer: onboarding + diagnostic, settings, beacon, finger guide, keyboard modes, sounds, achievements, constellation), Phase 4 (ML shadow mode: local logistic regression, shadow logging, adaptive-coach toggle) and Phase 5 (release work: backup export/import, diagnostics, migration tests, signing config) are implemented and verified. Only distribution/signing decisions remain.
- Package manager: **npm only** (no pnpm/yarn). `package-lock.json` is committed.

## Verified commands (run in this order before any commit)

```sh
npm run typecheck   # tsc --noEmit for both tsconfig.json (web) and tsconfig.node.json (electron/configs)
npm run lint        # eslint electron src --max-warnings 0 (use `npx eslint .` for repo-wide, e2e included)
npm test            # vitest run (94 tests: 13 metrics/input + 21 coach + 24 lib + 22 ml + 8 backup + 6 migrations)
npx playwright test # e2e smoke (needs `npm run pretest` first if dist-electron is stale)
npm run build       # vite build + electron-builder NSIS installer -> release/0.1.0/
```

All five were green as of the Phase 5 gate (2026-10-08). The packaged gate:
launch `release/0.1.0/win-unpacked/Beacon Type.exe` (it must stay alive — that
proves `better-sqlite3` loads), then run `node test/check-packaged-db.cjs` and
confirm `%APPDATA%\Beacon Type\beacontype.db` reaches `schema_migrations` v6
(`initial-schema`, `seed-lessons`, `coach-lessons-and-profile`,
`diagnostic-lesson`, `ml-shadow-log`, `lesson-content-honesty`) with 10 lessons
including `diagnostic` and the `ml_shadow_log` table present. An existing
older database must upgrade in place. The e2e DB
(`%APPDATA%\Electron\beacontype.db`) migrates in place too.

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
- **UI settings are plain `settings` rows** (`ui.sound`, `ui.voice`, `ui.reducedMotion`, `ui.keyboardMode`, `ui.fontSize`, `ui.adaptiveCoach`, `ui.onboarded`) parsed defensively by `loadSettings()` in `src/lib/settings.ts` — unknown/garbage values fall back to defaults, never crash a screen. `App.tsx` mirrors settings into `html[data-font]` and `html[data-motion='reduced']` (CSS-wide font sizing and motion flattening). Do not pass reduced-motion/font-size as props — the root attributes own them.
- **Onboarding gate:** a fresh account (no `ui.onboarded` flag AND zero sessions) shows `Onboarding.tsx`; any existing session counts as onboarded for pre-flag upgrades. The diagnostic lesson (`diagnostic`, migration v4) is a normal lesson row.
- **Beacon (`BeaconOrb`) is ambient only:** state (`idle`/`well`/`error`) flips exclusively on threshold crossings via the no-op-guarded setter (650 ms error hold) — never setState per keystroke. It must never be the sole error signal (errors also get the wavy underline + status line).
- **Keyboard modes** (settings `keyboardMode`): `always` / `fade` (dims after 6 s) / `no-peek` (keyboard not rendered). The `HandGuide` stays visible in *all* modes and shows the **finger, not the key position** — that is why it stays useful in no-peek mode. Expected-key outline and pressed-key highlight both use physical `event.code`-style codes (`codeForChar()` in `src/lib/fingers.ts`, unit-tested).
- **Sounds** live in `src/lib/audio.ts` (Web Audio, no asset files, lazy `AudioContext` created on first keydown). Callers gate on the `sound` setting; the module never reads settings itself.
- **Achievements and constellation are derived, never persisted** (`src/lib/achievements.ts`, `Constellation.tsx` uses `computeWeakness`) — they cannot drift from the data or be lost. Constellation layout is a deterministic golden-angle spiral over a–z.
- **Migration v4 added the `diagnostic` lesson** (10 lessons total, `INSERT OR IGNORE`). Keep `target_keys` honest — list only characters that actually appear in the content. **Migration v6 (`lesson-content-honesty`) fixed lessons that broke this rule** (drills/common-words/passages/diagnostic were missing letters and a comma their target_keys promised); the test `keeps every lesson target_keys honest` in `electron/main/migrations.test.ts` enforces this forever — never add a target key the content does not use, and never shrink a lesson's promise without updating its text via a new migration.
- **Migration tests live next to the code** (`electron/main/migrations.test.ts`, in-memory `better-sqlite3`): fresh apply v1→latest, in-place upgrade of an older DB with data intact, idempotency, and the target_keys honesty check. `vitest.config.ts` includes `electron/**` for these plus the backup-format tests.
- **Backup export/import (Phase 5):** the format is defined in `electron/shared/backup.ts` (dependency-free, hand-rolled validation — do not add zod there; the sandboxed preload bundles `electron/shared`). Export/import handlers in `electron/main/ipc.ts` use native save/open dialogs; **restore REPLACES** the user-owned tables (`sessions`, `keystroke_events`, `key_stats`, `settings`, `ml_shadow_log`) in one transaction and resets the `sessions` AUTOINCREMENT counter; `lessons` and `user_profile` are app-managed and stay untouched. Inserts use explicit column lists from the validated rows — never interpolate raw backup keys into SQL. The renderer only shows status and calls `location.reload()` after a successful restore.
- **Feedback loop is diagnostics-for-now** (Settings → "Copy diagnostics" assembles version/schema/session-count/db-path). When a real channel exists, wire it there — do not invent an address in code.
- **Code signing is env-driven, no config needed:** set `CSC_LINK` (path/URL to the .pfx) and `CSC_KEY_PASSWORD` when running `npm run build`; `win.signtoolOptions.timeStampServer` is already set in `electron-builder.json` (note: flat `timestampUrl`/`timeStampServer` under `win` are rejected by the electron-builder 26 schema — they must sit inside `signtoolOptions`). The current installer is self-signed by electron-builder's dev fallback until a real certificate arrives.
- **e2e handles the onboarding branch** (fresh DB → "Skip for now"); to re-test that path, move `%APPDATA%\Electron\beacontype.db` (plus `-wal`/`-shm`) aside for one run, then restore.
- **ML model (Phase 4) stays shadow-mode; rules remain the fallback.** The engine lives in `src/engine/ml.ts` (pure TS, same purity rules as the coach engine; `ML_CONFIG` holds every tunable: target accuracy 0.95, min 10 examples, target success 0.75, acceptance/margin gates, 600 epochs). Training examples come from *consecutive session pairs* (features of session i predict whether session i+1 hit the accuracy target — never a session predicting itself). `trainModel` is deterministic full-batch logistic regression with z-score normalization and returns `null` below the minimum sample count. Renderer glue is `src/lib/shadow.ts`; `App.finish()` writes one `ml_shadow_log` row per saved session (best-effort — failures never surface as save failures) via `logShadow`, and the LessonSelect "Adaptive coach (shadow)" section renders the comparison (agreement, Brier, last 5 rows, pending outcomes). The `ui.adaptiveCoach` toggle (default **false**) only lets the model steer the Recommended card when `resolveDriver` says the model's pick is clearly safer (`p ≥ 0.7` and `≥ 0.05` above the rule pick's prediction); the chosen lesson id, its `p`, and the rule pick's `p` are what get logged, and the *outcome* is always resolved at read time from the following session. Do not persist model weights or derived outcomes — both are rebuildable from sessions + log rows.

## Environment gotchas (this machine)

- **Port 5173 may be taken** by another project's dev server; Vite then binds 5174. When verifying dev-mode behavior, confirm the port from the `npm run dev` output — probing 5173 can hit a foreign app.
- **electron-builder can fail with `EPERM` renaming `win-unpacked.tmp` → `win-unpacked`** (Defender holds the freshly extracted binaries; no admin rights to add an exclusion). A local patch in `node_modules/app-builder-lib/out/util/electronGet.js` retries that rename for up to 60 s — it is already applied on this machine; **`npm ci` reverts it** (re-apply: wrap the `fs.rename(tmpDir, dir)` after `fs.rm(dir, ...)` in a ~60×1 s retry loop). If the error still appears, delete **every** `win-unpacked*` directory under `release/<version>/` (the `.tmp`, any stale target, any `_retryN` leftovers — moving only the `.tmp` does NOT help), sleep ~5 s, re-run. **Do not check success by installer existence** — a stale installer from an earlier build survives failed attempts; compare `LastWriteTime` against a timestamp taken before the build started. Bare `npx electron-builder` also does NOT run `vite build` — use `npm run build` when renderer sources changed. A freshly rebuilt `Beacon Type.exe` may also be blocked once by Application Control on first launch; the `&` call operator succeeds where `Start-Process` reports the block.
- **NTFS is case-insensitive:** `beacontype` and `BeaconType` are the same directory. Never `Remove-Item` a repo path with different casing — it happened once already.
- **Git identity is not configured globally.** Commit with inline config: `git -c user.email=dev@local -c user.name=beacontype-dev commit ...`.
- **Packaged and dev/e2e userData paths:** the packaged app uses `%APPDATA%\Beacon Type\`; non-packaged Electron (Playwright e2e, `npm run dev`) uses `%APPDATA%\Electron\` — both hold a `beacontype.db`. There is no `%APPDATA%\beacontype\`.

## UX invariants

- During a live lesson show only what helps typing — charts and rewards belong on the results screen.
- Errors default to "continue with the error marked" (stop-on-error is an option); record the mode with each session.
- Accessibility (color tokens, reduced motion, keyboard nav, non-color-only feedback) is built from Phase 1, not retrofitted.

## Recommended build order

Packaged skeleton → engine + tests → rule-based coach → experience layer → ML experiment → release features (done; code signing and distribution still pending user decisions).
