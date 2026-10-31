import { ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import * as v from 'valibot'
import { IPC, type AppState } from '../shared/ipc'
import {
  ChannelPayload,
  SetBoundsPayload,
  SetChannelEnabledPayload,
  SetEnabledPayload,
  SetLabelPayload,
  SetMutedPayload,
  SetHideGamePayload,
  SetPhasePayload,
  SetSystemPayload,
  SetVisiblePayload,
  SetZoomPayload,
  SlotIdPayload,
  type MemoryPhase,
  type SystemConfig,
} from '../shared/schemas'
import { log, logDir } from './logger'
import type { EventFeed } from './game/EventFeed'
import type { SlotManager } from './slots/SlotManager'
import type { TwitchService } from './twitch/TwitchService'

type Deps = {
  slots: SlotManager
  twitch: TwitchService
  feed: EventFeed
  getState: () => AppState
  setSystem: (patch: Partial<SystemConfig>) => void
  relaunch: () => void
  setPhase: (phase: MemoryPhase) => void
  releasesUrl: string
}

export function registerIpc(win: BrowserWindow, deps: Deps): void {
  const { slots, twitch, feed, getState } = deps
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

  // canal com resposta (invoke) e payload validado
  function handle<S extends v.GenericSchema, R>(
    channel: string,
    schema: S,
    handler: (payload: v.InferOutput<S>) => R | Promise<R>,
  ) {
    ipcMain.handle(channel, (event, payload: unknown) => {
      if (!fromUi(event.sender)) throw new Error('remetente não autorizado')
      return handler(v.parse(schema, payload))
    })
  }

  handle(IPC.getState, v.undefined(), () => getState())
  handle(IPC.capture, v.undefined(), () => slots.capture())
  handle(IPC.clearSession, SlotIdPayload, ({ id }) => slots.clearSession(id))
  handle(IPC.eventsList, v.undefined(), () => [...feed.list()])
  on(IPC.eventsClear, v.undefined(), () => feed.clear())

  ipcMain.on(IPC.openLogs, (event) => {
    if (fromUi(event.sender)) void shell.openPath(logDir())
  })
  ipcMain.on(IPC.hideToTray, (event) => {
    if (fromUi(event.sender)) win.hide()
  })
  ipcMain.on(IPC.openReleases, (event) => {
    if (fromUi(event.sender)) void shell.openExternal(deps.releasesUrl)
  })
  on(IPC.setSystem, SetSystemPayload, (patch) => deps.setSystem(patch))
  on(IPC.relaunch, v.undefined(), () => deps.relaunch())
  on(IPC.setPhase, SetPhasePayload, ({ phase }) => deps.setPhase(phase))
  on(IPC.setHideGame, SetHideGamePayload, ({ id, hide }) => slots.setHideGame(id, hide))

  on(IPC.setBounds, SetBoundsPayload, ({ id, bounds }) => slots.setBounds(id, bounds))
  on(IPC.setMuted, SetMutedPayload, ({ id, muted }) => slots.setMuted(id, muted))
  on(IPC.setEnabled, SetEnabledPayload, ({ id, enabled }) => slots.setEnabled(id, enabled))
  on(IPC.setZoom, SetZoomPayload, ({ id, zoom }) => slots.setZoom(id, zoom))
  on(IPC.reload, SlotIdPayload, ({ id }) => slots.reload(id))
  on(IPC.setLabel, SetLabelPayload, ({ id, label }) => slots.setLabel(id, label))
  on(IPC.setVisible, SetVisiblePayload, ({ visible }) => slots.setVisible(visible))

  on(IPC.twitchLogin, v.undefined(), () => void twitch.login())
  on(IPC.twitchCancelLogin, v.undefined(), () => twitch.cancelLogin())
  on(IPC.twitchOpenActivate, v.undefined(), () => twitch.openActivate())
  on(IPC.twitchLogout, v.undefined(), () => void twitch.logout())
  on(IPC.twitchSetChannelEnabled, SetChannelEnabledPayload, ({ login, enabled }) =>
    twitch.setChannelEnabled(login, enabled),
  )
  on(IPC.twitchAddExtra, ChannelPayload, ({ login }) => twitch.addExtra(login))
  on(IPC.twitchRemoveExtra, ChannelPayload, ({ login }) => twitch.removeExtra(login))
}
