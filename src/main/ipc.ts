import { ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import * as v from 'valibot'
import { IPC, type AppState } from '../shared/ipc'
import {
  MarkPayload,
  SetBoundsPayload,
  SetEnabledPayload,
  SetMutedPayload,
  SetZoomPayload,
  SlotIdPayload,
} from '../shared/schemas'
import { log, logDir } from './logger'
import type { SlotManager } from './slots/SlotManager'
import type { WsRecorder } from './slots/recorder'

export function registerIpc(
  win: BrowserWindow,
  slots: SlotManager,
  recorder: WsRecorder,
  getState: () => AppState,
): void {
  const fromUi = (sender: WebContents) => sender.id === win.webContents.id

  // canal fire-and-forget com payload validado
  function on<S extends v.GenericSchema>(channel: string, schema: S, handler: (payload: v.InferOutput<S>) => void) {
    ipcMain.on(channel, (event, payload: unknown) => {
      if (!fromUi(event.sender)) return
      const result = v.safeParse(schema, payload)
      if (!result.success) {
        log(`IPC inválido em ${channel}: ${v.summarize(result.issues)}`)
        return
      }
      handler(result.output)
    })
  }

  ipcMain.handle(IPC.getState, (event) => {
    if (!fromUi(event.sender)) throw new Error('remetente não autorizado')
    return getState()
  })

  ipcMain.on(IPC.openLogs, (event) => {
    if (fromUi(event.sender)) void shell.openPath(logDir())
  })

  ipcMain.on(IPC.hideToTray, (event) => {
    if (fromUi(event.sender)) win.hide()
  })
  ipcMain.on(IPC.recorderStart, (event) => {
    if (fromUi(event.sender)) recorder.start()
  })
  ipcMain.on(IPC.recorderStop, (event) => {
    if (fromUi(event.sender)) recorder.stop()
  })
  on(IPC.recorderMark, MarkPayload, ({ text }) => recorder.mark(text))

  on(IPC.setBounds, SetBoundsPayload, ({ id, bounds }) => slots.setBounds(id, bounds))
  on(IPC.setMuted, SetMutedPayload, ({ id, muted }) => slots.setMuted(id, muted))
  on(IPC.setEnabled, SetEnabledPayload, ({ id, enabled }) => slots.setEnabled(id, enabled))
  on(IPC.setZoom, SetZoomPayload, ({ id, zoom }) => slots.setZoom(id, zoom))
  on(IPC.reload, SlotIdPayload, ({ id }) => slots.reload(id))
}
