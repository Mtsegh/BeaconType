import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { openDb } from './db'
import { MIGRATIONS } from './migrations'
import { registerIpc } from './ipc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main (ESM)
// │ └─┬ preload
// │   └── index.cjs   > Preload-Script (CJS, required for sandbox)
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (process.platform === 'win32' && os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
app.setAppUserModelId('com.beacontype.app')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.cjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    title: 'Beacon Type',
    width: 1024,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#05070f',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Security defaults (locked in AGENTS.md): context isolation on, no
      // Node in the renderer, sandboxed. The renderer is a plain web app
      // that talks to the main process only via the typed preload API.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Deny any navigation away from the app itself.
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = VITE_DEV_SERVER_URL ? url.startsWith(VITE_DEV_SERVER_URL) : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  // External links open in the system browser only, and only over HTTPS.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  const { db, dbPath } = openDb(MIGRATIONS)
  registerIpc(db, dbPath)

  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})