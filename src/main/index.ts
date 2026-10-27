import { app } from 'electron'
import { IPC, type AppState, type WindowMode } from '../shared/ipc'
import { registerIpc } from './ipc'
import { log, logDir } from './logger'
import { SlotManager } from './slots/SlotManager'
import { loadConfig, saveConfig } from './store'
import { createTray } from './tray'
import { createMainWindow } from './window'

const PROBE_EVERY_MS = 30_000

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

  const windowMode = (): WindowMode => {
    // no Windows, janela minimizada também tem isVisible() = false: checar minimizada primeiro
    if (win.isMinimized()) return 'minimized'
    if (!win.isVisible()) return 'tray'
    return win.isFocused() ? 'focused' : 'unfocused'
  }
  const getState = (): AppState => ({ slots: slots.states(), windowMode: windowMode(), logDir: logDir() })
  const broadcast = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.state, getState())
  }

  const slots = new SlotManager(win, config, () => saveConfig(config), broadcast)
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
  // rede de segurança: minimizar ainda é possível por atalhos do Windows (ex.: Win+↓)
  win.on('minimize', () => {
    log('minimizar interceptado → bandeja')
    win.restore()
    win.hide()
  })
  for (const ev of ['show', 'hide', 'minimize', 'restore', 'focus', 'blur'] as const) {
    win.on(ev as 'show', () => {
      log(`janela: ${ev}`)
      broadcast()
    })
  }

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
  setInterval(() => void slots.probeAll(windowMode()), PROBE_EVERY_MS)
  log(`Deck Chat iniciado (Electron ${process.versions.electron}, dados em ${app.getPath('userData')})`)
}
