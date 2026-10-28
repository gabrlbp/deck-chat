import { app } from 'electron'
import { IPC, type AppState } from '../shared/ipc'
import { EventFeed } from './game/EventFeed'
import { registerIpc } from './ipc'
import { log } from './logger'
import { SlotManager } from './slots/SlotManager'
import { loadConfig, saveConfig } from './store'
import { createTray } from './tray'
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
  const getState = (): AppState => ({ slots: slots.states(), info })
  const broadcast = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.state, getState())
  }

  const feed = new EventFeed((event) => {
    log(`[evento] ${event.slot} ${event.nick ?? '?'} ${event.kind}: ${event.title}${event.detail ? ` (${event.detail})` : ''}`)
  })
  const slots = new SlotManager(win, config, () => saveConfig(config), broadcast, (event) => feed.push(event))
  registerIpc(win, slots, getState)

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
    slots.destroyAll()
  })

  slots.start()
  setInterval(() => slots.tick(), TICK_MS)
  log(`Deck Chat iniciado (Electron ${process.versions.electron}, dados em ${app.getPath('userData')})`)
}
