import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'
import pkg from './package.json' with { type: 'json' }

const external = Object.keys(
  'dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {},
)

// The index.html CSP is strict for production. Vite's dev mode injects inline
// scripts (React fast-refresh) and styles (Tailwind), so the dev server swaps
// in a dev-friendly policy. Packaged builds keep the strict policy untouched.
function devCSP(): Plugin {
  return {
    name: 'dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      const strict = /<meta\s[^>]*http-equiv=["']content-security-policy["'][^>]*content=["']([^"']+)["'][^>]*\/?>/i
      const match = html.match(strict)
      if (!match) return html
      const devPolicy =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
      return html.replace(match[0], `<meta http-equiv="Content-Security-Policy" content="${devPolicy}" />`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      devCSP(),
      electronSimple({
        main: {
          input: 'electron/main/index.ts',
          // Main process is bundled with production deps external, so native
          // modules (better-sqlite3) resolve from node_modules at runtime and
          // electron-builder can pack/unpack them.
          options: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external,
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          // Sandboxed preload scripts must be CommonJS, not ESM.
          options: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: ['electron'],
                output: {
                  format: 'cjs',
                  entryFileNames: 'index.cjs',
                },
              },
            },
          },
        },
        // No renderer polyfill: the renderer is a plain web app with no Node
        // access. contextBridge is the only bridge.
      }),
    ],
    clearScreen: false,
  }
})