import type { BTAPI } from '../../electron/shared/api'

declare global {
  interface Window {
    btAPI: BTAPI
  }
}

export {}