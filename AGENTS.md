# AGENTS.md

## Repo status

- The single source of truth for *what* to build is `ProjectDescription.md` — read it fully before writing code.
- The scaffold has landed: Electron + Vite (`vite-plugin-electron`) + React + TypeScript + Tailwind v4 + `better-sqlite3`. Phase 0 (packaged skeleton) and Phase 1 (engine + one lesson + results) are implemented and verified.
- Package manager: **npm only** (no pnpm/yarn). `package-lock.json` is committed.

## Verified commands (run in this order before any commit)

```sh
npm run typecheck   # tsc --noEmit for both tsconfig.json (web) and tsconfig.node.json (electron/configs)
npm run lint        # eslint electron src --max-warnings 0
npm test            # vitest run (13 engine tests); pretest rebuilds dist-electron first
npx playwright test # e2e smoke (needs `npm run pretest` first if dist-electron is stale)
npm run build       # vite build + electron-builder NSIS installer -> release/0.1.0/
```

All five were green as of the Phase 0/1 gate (2026-10-08). The packaged gate:
launch `release/0.1.0/win-unpacked/Beacon Type.exe`, then confirm a fresh
`%APPDATA%\Beacon Type\beacontype.db` exists with `journal_mode=wal`, table
`schema_migrations` at version 2 (`initial-schema`, `seed-lessons`), and 4 lessons.

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
- **Performance rule:** never re-render the full passage per keystroke — `LessonPlayer` updates char DOM imperatively via refs. Input latency is the one thing a typing app cannot get wrong.
- **Adaptive coach weights** live in one config object (they are a starting guess): `weakness = 0.55·err + 0.25·slow + 0.20·recent`, with smoothing `(errors+1)/(attempts+20)`.
- ML model stays shadow-mode and optional; rules remain the fallback.

## Environment gotchas (this machine)

- **Port 5173 may be taken** by another project's dev server; Vite then binds 5174. When verifying dev-mode behavior, confirm the port from the `npm run dev` output — probing 5173 can hit a foreign app.
- **electron-builder can fail with `EPERM` renaming `win-unpacked.tmp` → `win-unpacked`** (Defender holds the freshly extracted binaries briefly; no admin rights to add an exclusion). Fix: sleep ~3 s, `Move-Item win-unpacked.tmp win-unpacked`, run `npx electron-builder` again — attempt 2 succeeds.
- **NTFS is case-insensitive:** `beacontype` and `BeaconType` are the same directory. Never `Remove-Item` a repo path with different casing — it happened once already.
- **Git identity is not configured globally.** Commit with inline config: `git -c user.email=dev@local -c user.name=beacontype-dev commit ...`.
- **Packaged app userData path** is `%APPDATA%\Beacon Type\`; dev/e2e Electron uses `%APPDATA%\beacontype\` (lowercase app name).

## UX invariants

- During a live lesson show only what helps typing — charts and rewards belong on the results screen.
- Errors default to "continue with the error marked" (stop-on-error is an option); record the mode with each session.
- Accessibility (color tokens, reduced motion, keyboard nav, non-color-only feedback) is built from Phase 1, not retrofitted.

## Recommended build order

Packaged skeleton → engine + tests → rule-based coach → experience layer → ML experiment → signed release.
