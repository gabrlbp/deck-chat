import { app, powerMonitor } from 'electron'
import { readFileSync } from 'node:fs'
import { IPC, type AppState } from '../shared/ipc'
import { EventFeed } from './game/EventFeed'
import { registerIpc } from './ipc'
import { log } from './logger'
import { SlotManager } from './slots/SlotManager'
import { loadConfig, saveConfig } from './store'
import { createTray } from './tray'
import { TwitchService } from './twitch/TwitchService'
import { createMainWindow } from './window'

const TICK_MS = 10_000

// Remove "Electron/x" e "deck-chat/x" do user-agent: alguns sites bloqueiam ou tratam diferente.
app.userAgentFallback = app.userAgentFallback.replace(/\s(?:Electron|deck-chat)\/\S+/g, '')

// Janela coberta por outra (ex.: navegador maximizado por cima) não deve ser tratada como oculta.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

if (!app.requestSingleInstanceLock()) {
  // duas instâncias disputariam as mesmas partitions em disco
  app.quit()
} else {
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  const startHidden = process.argv.includes('--hidden')
  const config = loadConfig()
  const win = createMainWindow(startHidden)
  let quitting = false

  const info = { version: app.getVersion(), electron: process.versions.electron, dataDir: app.getPath('userData') }
  const getState = (): AppState => ({ slots: slots.states(), info, twitch: twitch.state() })
  const broadcast = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.state, getState())
  }
  const persist = () => saveConfig(config)

  const feed = new EventFeed((event) => {
    log(`[evento] ${event.slot} ${event.nick ?? '?'} ${event.kind}: ${event.title}${event.detail ? ` (${event.detail})` : ''}`)
    if (!win.isDestroyed()) win.webContents.send(IPC.eventNew, event)
  })
  const slots = new SlotManager(win, config, persist, broadcast, (event) => feed.push(event))
  const twitch = new TwitchService(config, persist, broadcast)
  registerIpc(win, slots, twitch, feed, getState)
  powerMonitor.on('resume', () => twitch.onResume())

  const quit = () => {
    quitting = true
    app.quit()
  }
  createTray(win, quit)

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
    slots.destroyAll()
  })

  slots.start()
  void twitch.start()
  setInterval(() => {
    twitch.syncFromGame(slots.snapshots().map((s) => s.snapshot))
    slots.tick()
  }, TICK_MS)
  log(`Deck Chat iniciado (Electron ${process.versions.electron}, dados em ${app.getPath('userData')})`)

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
