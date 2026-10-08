/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: 'true'
    /** The built directory structure root (project root). */
    APP_ROOT: string
    /** /dist/ in production or /public/ in dev. */
    VITE_PUBLIC: string
  }
}