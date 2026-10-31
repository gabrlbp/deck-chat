import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AppState, type DeckApi, type GameEvent } from '../shared/ipc'

const api: DeckApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppState) => listener(state)
    ipcRenderer.on(IPC.state, handler)
    return () => ipcRenderer.off(IPC.state, handler)
  },
  openLogs: () => ipcRenderer.send(IPC.openLogs),
  openReleases: () => ipcRenderer.send(IPC.openReleases),
  hideToTray: () => ipcRenderer.send(IPC.hideToTray),
  setSystem: (patch) => ipcRenderer.send(IPC.setSystem, patch),
  relaunch: () => ipcRenderer.send(IPC.relaunch),
  setPhase: (phase) => ipcRenderer.send(IPC.setPhase, { phase }),
  slots: {
    setBounds: (id, bounds) => ipcRenderer.send(IPC.setBounds, { id, bounds }),
    setMuted: (id, muted) => ipcRenderer.send(IPC.setMuted, { id, muted }),
    setEnabled: (id, enabled) => ipcRenderer.send(IPC.setEnabled, { id, enabled }),
    setZoom: (id, zoom) => ipcRenderer.send(IPC.setZoom, { id, zoom }),
    reload: (id) => ipcRenderer.send(IPC.reload, { id }),
    setLabel: (id, label) => ipcRenderer.send(IPC.setLabel, { id, label }),
    setVisible: (visible) => ipcRenderer.send(IPC.setVisible, { visible }),
    setHideGame: (id, hide) => ipcRenderer.send(IPC.setHideGame, { id, hide }),
    capture: () => ipcRenderer.invoke(IPC.capture),
    clearSession: (id) => ipcRenderer.invoke(IPC.clearSession, { id }),
  },
  twitch: {
    login: () => ipcRenderer.send(IPC.twitchLogin),
    cancelLogin: () => ipcRenderer.send(IPC.twitchCancelLogin),
    openActivate: () => ipcRenderer.send(IPC.twitchOpenActivate),
    logout: () => ipcRenderer.send(IPC.twitchLogout),
    setChannelEnabled: (login, enabled) => ipcRenderer.send(IPC.twitchSetChannelEnabled, { login, enabled }),
    addExtra: (login) => ipcRenderer.send(IPC.twitchAddExtra, { login }),
    removeExtra: (login) => ipcRenderer.send(IPC.twitchRemoveExtra, { login }),
  },
  events: {
    list: () => ipcRenderer.invoke(IPC.eventsList),
    clear: () => ipcRenderer.send(IPC.eventsClear),
    onNew: (listener) => {
      const handler = (_event: IpcRendererEvent, gameEvent: GameEvent) => listener(gameEvent)
      ipcRenderer.on(IPC.eventNew, handler)
      return () => ipcRenderer.off(IPC.eventNew, handler)
    },
  },
}

contextBridge.exposeInMainWorld('deck', api)
