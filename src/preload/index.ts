import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AppState, type DeckApi } from '../shared/ipc'

const api: DeckApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AppState) => listener(state)
    ipcRenderer.on(IPC.state, handler)
    return () => ipcRenderer.off(IPC.state, handler)
  },
  openLogs: () => ipcRenderer.send(IPC.openLogs),
  hideToTray: () => ipcRenderer.send(IPC.hideToTray),
  slots: {
    setBounds: (id, bounds) => ipcRenderer.send(IPC.setBounds, { id, bounds }),
    setMuted: (id, muted) => ipcRenderer.send(IPC.setMuted, { id, muted }),
    setEnabled: (id, enabled) => ipcRenderer.send(IPC.setEnabled, { id, enabled }),
    setZoom: (id, zoom) => ipcRenderer.send(IPC.setZoom, { id, zoom }),
    reload: (id) => ipcRenderer.send(IPC.reload, { id }),
    setLabel: (id, label) => ipcRenderer.send(IPC.setLabel, { id, label }),
    setVisible: (visible) => ipcRenderer.send(IPC.setVisible, { visible }),
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
}

contextBridge.exposeInMainWorld('deck', api)
