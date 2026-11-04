import { app, powerMonitor } from 'electron'
import { readFileSync } from 'node:fs'
import { IPC, type AppState, type MemorySample, type SlotStatus } from '../shared/ipc'
import type { SystemConfig } from '../shared/schemas'
import { summarize } from '../shared/twitch'
import { applyAutoStart, autoStartSupported } from './autostart'
import { MemoryMonitor } from './diagnostics/MemoryMonitor'
import { pickSlotToReload } from './diagnostics/memoryGuard'
import { EventFeed } from './game/EventFeed'
import { registerIpc } from './ipc'
import { log } from './logger'
import { SlotManager } from './slots/SlotManager'
import { loadConfig, saveConfig } from './store'
import { AppTray, type TrayStatus } from './tray'
import { TwitchService } from './twitch/TwitchService'
import { Updater } from './updater'
import { createMainWindow } from './window'
import { KickSpike } from './kick/KickSpike'

const TICK_MS = 10_000
const RELEASES_URL = 'https://github.com/gabrlbp/deck-chat/releases'
const BAD_SLOT: SlotStatus[] = ['error', 'crashed', 'unresponsive']

// Remove "Electron/x" e "deck-chat/x" do user-agent: alguns sites bloqueiam ou tratam diferente.
app.userAgentFallback = app.userAgentFallback.replace(/\s(?:Electron|deck-chat)\/\S+/g, '')

// Janela coberta por outra (ex.: navegador maximizado por cima) não deve ser tratada como oculta.
// BackgroundVideoTrackOptimization: não congelar o vídeo das lives da Kick escondidas (S6)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,BackgroundVideoTrackOptimization')
app.commandLine.appendSwitch('disable-background-media-suspend')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

if (!app.requestSingleInstanceLock()) {
  // duas instâncias disputariam as mesmas partitions em disco
  app.quit()
} else {
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  // lida antes do app ficar pronto: desligar a GPU só funciona antes do whenReady
  const config = loadConfig()
  if (!config.system.hardwareAcceleration) app.disableHardwareAcceleration()

  await app.whenReady()

  const persist = () => saveConfig(config)
  // --hidden só vem do auto-start do Windows (quando "iniciar na bandeja" está ligado)
  const startHidden = process.argv.includes('--hidden')
  const win = createMainWindow(startHidden, config.window, (state) => {
    config.window = state
    persist()
  })
  let quitting = false
  // F9: criado cedo porque o estado da UI e o tray o leem
  const updater = new Updater(
    () => broadcast(),
    () => {
      quitting = true
    },
  )

  const info = { version: app.getVersion(), electron: process.versions.electron, dataDir: app.getPath('userData') }
  const getState = (): AppState => ({
    slots: slots.states(),
    info,
    twitch: twitch.state(),
    system: {
      ...config.system,
      autoStartSupported: autoStartSupported(),
      hardwareAccelerationActive: app.isHardwareAccelerationEnabled(),
    },
    memory: memory.state(),
    update: updater.snapshot,
    kick: kick.state(),
  })

  const trayStatus = (): TrayStatus => {
    const t = twitch.state()
    const s = summarize(t, Date.now())
    const enabled = slots.states().filter((slot) => slot.enabled)
    const bad = enabled.filter((slot) => BAD_SLOT.includes(slot.status))
    const twitchLine =
      t.auth.state !== 'connected'
        ? 'Twitch: não conectada'
        : t.connection !== 'connected'
          ? 'Twitch: reconectando ao chat…'
          : `Twitch: ${s.live}/${s.total} ao vivo · ${s.bonus} bônus`
    return {
      lines: [
        twitchLine,
        `Slots: ${enabled.length - bad.length}/${enabled.length} ok`,
        ...(updater.snapshot.kind === 'ready' ? [`Versão ${updater.snapshot.version} pronta (instala ao sair)`] : []),
      ],
      degraded: bad.length > 0 || t.auth.state === 'reauth' || (t.auth.state === 'connected' && t.connection !== 'connected'),
    }
  }

  const broadcast = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.state, getState())
    tray.update(trayStatus())
  }

  const feed = new EventFeed((event) => {
    log(`[evento] ${event.slot} ${event.nick ?? '?'} ${event.kind}: ${event.title}${event.detail ? ` (${event.detail})` : ''}`)
    if (!win.isDestroyed()) win.webContents.send(IPC.eventNew, event)
  })
  const slots = new SlotManager(win, config, persist, broadcast, (event) => feed.push(event))
  const twitch = new TwitchService(config, persist, broadcast)
  // spike S6: lista oficial e bônus vêm do bloco `kick` do jogo (prefere o slot com a Kick vinculada)
  const kickBlocks = () =>
    slots.snapshots().flatMap(({ id, snapshot }) => (snapshot.kick ? [{ slot: id, kick: snapshot.kick }] : []))
  const kick = new KickSpike({
    officials: () => {
      const blocks = kickBlocks()
      const best = blocks.find((b) => b.kick.vinculado && b.kick.oficiais) ?? blocks.find((b) => b.kick.oficiais)
      return best?.kick.oficiais ?? []
    },
    game: () => kickBlocks().map(({ slot, kick: k }) => ({ slot, vinculado: k.vinculado, login: k.login, bonus: k.bonus })),
    onChange: () => broadcast(),
  })
  const tray = new AppTray(win, () => {
    quitting = true
    app.quit()
  })

  const memory = new MemoryMonitor({
    knownProcesses: () => {
      const known = new Map<number, string>([[win.webContents.getOSProcessId(), 'interface']])
      for (const s of slots.processIds()) known.set(s.pid, s.nick ? `${s.id} · ${s.nick}` : s.id)
      for (const [pid, label] of kick.processLabels()) known.set(pid, label)
      return known
    },
    context: () => ({
      gpu: app.isHardwareAccelerationEnabled(),
      window: win.isMinimized() ? 'minimizada' : win.isVisible() ? 'visivel' : 'bandeja',
    }),
    onSample: (sample) => {
      guardMemory(sample)
      broadcast()
    },
  })

  // F8: recarrega o slot que passou do limite de memória (um por vez, no máximo 1x/hora por slot)
  let lastMemoryReloadAt: number | undefined
  const guardMemory = (sample: MemorySample) => {
    const { enabled, limitMb } = config.system.memoryReload
    if (!enabled) return
    const byPid = new Map(sample.processes.map((p) => [p.pid, p.privateMb ?? p.workingSetMb]))
    const candidates = slots.guardInfo(win.isVisible() && win.isFocused()).map((s) => ({ ...s, memoryMb: byPid.get(s.pid) ?? 0 }))
    const id = pickSlotToReload(candidates, limitMb, sample.at, lastMemoryReloadAt)
    if (!id) return
    lastMemoryReloadAt = sample.at
    slots.reloadForMemory(id, candidates.find((c) => c.id === id)?.memoryMb ?? 0, limitMb)
  }

  const setSystem = (patch: Partial<SystemConfig>) => {
    config.system = { ...config.system, ...patch }
    persist()
    applyAutoStart(config.system)
    broadcast()
  }
  const relaunch = () => {
    log('reiniciando o app a pedido')
    // não repassa --hidden: quem pediu o reinício está olhando a janela
    app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== '--hidden') })
    quitting = true
    app.quit()
  }
  registerIpc(win, {
    slots,
    twitch,
    feed,
    getState,
    setSystem,
    relaunch,
    releasesUrl: RELEASES_URL,
    updater,
    kick,
  })
  applyAutoStart(config.system)
  powerMonitor.on('resume', () => twitch.onResume())

  // fechar a janela = esconder na bandeja. Sair só pelo menu do tray.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })
  // minimizada, a janela recebe ~1 frame/s (S3). Atalhos do Windows (ex.: Win+↓) ainda minimizam.
  win.on('minimize', () => {
    log('minimizar interceptado → bandeja')
    win.restore()
    win.hide()
  })

  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.on('before-quit', () => {
    quitting = true
    twitch.dispose()
    kick.dispose()
    slots.destroyAll()
  })

  slots.start()
  void twitch.start()
  memory.start()
  updater.start()
  kick.start()
  setInterval(() => {
    twitch.syncFromGame(slots.snapshots().map((s) => s.snapshot))
    slots.tick()
  }, TICK_MS)
  log(
    `Deck Chat ${info.version} iniciado (Electron ${info.electron}, dados em ${info.dataDir}${startHidden ? ', na bandeja' : ''})`,
  )
  // diagnóstico do B1: confirma se o Windows repassou o --hidden do auto-start
  log(
    `argumentos: ${process.argv.slice(1).join(' ') || '(nenhum)'} · GPU ${app.isHardwareAccelerationEnabled() ? 'ligada' : 'desligada'}`,
  )

  const replayFile = process.env['DECK_REPLAY']
  if (!app.isPackaged && replayFile) setTimeout(() => replayRecording(replayFile, slots), 3000)
}

/** Desenvolvimento: `DECK_REPLAY=gravacao.jsonl npm run dev` passa uma gravação do S4 pelos slots. */
function replayRecording(file: string, slots: SlotManager): void {
  const frames = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { slot: string; dir: string; data?: string })
    .flatMap((entry) => (entry.dir === 'in' && entry.data ? [{ slot: entry.slot, data: entry.data }] : []))
  log(`[replay] ${frames.length} mensagens de ${file}`)
  slots.replay(frames)
}
