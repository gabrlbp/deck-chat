import { ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import * as v from 'valibot'
import { IPC, type AppState } from '../shared/ipc'
import {
  ChannelSlugPayload,
  SetBoundsPayload,
  SetKickPayload,
  TwitchPhasePayload,
  SetEnabledPayload,
  SetLabelPayload,
  SetMutedPayload,
  SetFocusPayload,
  SetSystemPayload,
  SetVisiblePayload,
  SetZoomPayload,
  SlotIdPayload,
  type SystemConfig,
} from '../shared/schemas'
import { log, logDir } from './logger'
import type { EventFeed } from './game/EventFeed'
import type { SlotManager } from './slots/SlotManager'
import type { TwitchSpike } from './twitch/TwitchSpike'
import type { Updater } from './updater'
import type { KickFarm } from './kick/KickFarm'

type Deps = {
  slots: SlotManager
  twitch: TwitchSpike
  feed: EventFeed
  getState: () => AppState
  setSystem: (patch: Partial<SystemConfig>) => void
  relaunch: () => void
  releasesUrl: string
  updater: Updater
  kick: KickFarm
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
  on(IPC.updateCheck, v.undefined(), () => deps.updater.check())
  on(IPC.updateInstall, v.undefined(), () => deps.updater.install())
  on(IPC.kickLogin, v.undefined(), () => deps.kick.login())
  on(IPC.kickLogout, v.undefined(), () => void deps.kick.logout())
  on(IPC.kickSet, SetKickPayload, (patch) => deps.kick.setConfig(patch))
  on(IPC.kickOpenStore, ChannelSlugPayload, ({ slug }) => deps.kick.openStore(slug.toLowerCase()))
  on(IPC.setFocus, SetFocusPayload, ({ id }) => slots.setFocus(id))

  on(IPC.setBounds, SetBoundsPayload, ({ id, bounds }) => slots.setBounds(id, bounds))
  on(IPC.setMuted, SetMutedPayload, ({ id, muted }) => slots.setMuted(id, muted))
  on(IPC.setEnabled, SetEnabledPayload, ({ id, enabled }) => slots.setEnabled(id, enabled))
  on(IPC.setZoom, SetZoomPayload, ({ id, zoom }) => slots.setZoom(id, zoom))
  on(IPC.reload, SlotIdPayload, ({ id }) => slots.reload(id))
  on(IPC.setLabel, SetLabelPayload, ({ id, label }) => slots.setLabel(id, label))
  on(IPC.setVisible, SetVisiblePayload, ({ visible }) => slots.setVisible(visible))

  on(IPC.twitchLogin, v.undefined(), () => twitch.login())
  on(IPC.twitchLogout, v.undefined(), () => void twitch.logout())
  on(IPC.twitchSetPhase, TwitchPhasePayload, ({ phase }) => twitch.setPhase(phase))
  on(IPC.twitchOpenStore, ChannelSlugPayload, ({ slug }) => twitch.openStore(slug.toLowerCase()))
}
