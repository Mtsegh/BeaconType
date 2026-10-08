import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/api'
import type { BTAPI } from '../shared/api'

// The single typed bridge between the sandboxed renderer and the main
// process. The renderer has no Node access and no generic ipcRenderer
// passthrough - only these validated, capability-shaped calls.
const btAPI: BTAPI = {
  health: () => ipcRenderer.invoke(IPC.health),
  listLessons: () => ipcRenderer.invoke(IPC.listLessons),
  saveSession: (input) => ipcRenderer.invoke(IPC.saveSession, input),
  getKeyStats: () => ipcRenderer.invoke(IPC.getKeyStats),
  getCoach: () => ipcRenderer.invoke(IPC.getCoach),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSetting: (input) => ipcRenderer.invoke(IPC.setSetting, input),
  logShadow: (input) => ipcRenderer.invoke(IPC.logShadow, input),
  getMlLog: () => ipcRenderer.invoke(IPC.getMlLog),
}

contextBridge.exposeInMainWorld('btAPI', btAPI)