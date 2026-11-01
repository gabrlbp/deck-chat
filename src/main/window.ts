import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { WindowState } from '../shared/schemas'
import { log } from './logger'
import appIcon from '../../resources/icon.png?asset'

const SAVE_DELAY_MS = 500
const READY_TIMEOUT_MS = 3000

/** Só restaura a posição se ela ainda cair numa tela conectada (ex.: monitor removido). */
function visibleBounds(saved: WindowState | undefined) {
  if (!saved) return { width: 1440, height: 900 }
  const area = screen.getDisplayMatching(saved).workArea
  const overlaps =
    saved.x < area.x + area.width && saved.x + saved.width > area.x && saved.y < area.y + area.height && saved.y + saved.height > area.y
  return overlaps
    ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    : { width: saved.width, height: saved.height }
}

export function createMainWindow(
  startHidden: boolean,
  saved: WindowState | undefined,
  onState: (state: WindowState) => void,
): BrowserWindow {
  const win = new BrowserWindow({
    ...visibleBounds(saved),
    minWidth: 800,
    minHeight: 500,
    show: false,
    // minimizada, a janela recebe ~1 frame/s e o jogo desacelera (spike S3).
    // No lugar do minimizar nativo, a UI tem "esconder na bandeja", que mantém o fps.
    minimizable: false,
    title: 'Deck Chat',
    icon: appIcon,
    backgroundColor: '#0e0e10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // maximize() também MOSTRA a janela (documentado no Electron): aplicar só quando ela for exibida,
  // senão "iniciar escondido na bandeja" abre a janela no boot (B1)
  let pendingMaximize = saved?.maximized ?? false
  const restoreMaximized = () => {
    if (!pendingMaximize) return
    pendingMaximize = false
    win.maximize()
  }

  const showOnStart = (reason: string) => {
    if (startHidden || win.isDestroyed() || win.isVisible()) return
    if (reason !== 'ready-to-show') log(`janela exibida por ${reason}`)
    win.show()
    restoreMaximized()
  }
  win.once('ready-to-show', () => showOnStart('ready-to-show'))
  // rede de segurança: no Wayland o ready-to-show às vezes nunca chega para uma janela ainda escondida
  setTimeout(() => showOnStart('timeout (ready-to-show não veio em 3 s)'), READY_TIMEOUT_MS)
  // primeira vez que sai da bandeja
  win.on('show', restoreMaximized)

  let saveTimer: NodeJS.Timeout | null = null
  const save = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      // maximizada: guarda o tamanho "normal" para quando sair do maximizado
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
      onState({ ...bounds, maximized: win.isMaximized() })
    }, SAVE_DELAY_MS)
  }
  for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) win.on(event as 'resize', save)

  // a UI própria nunca navega nem abre popups
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  return win
}
