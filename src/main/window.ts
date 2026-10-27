import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export function createMainWindow(startHidden: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    // minimizada, a janela recebe ~1 frame/s e o jogo desacelera (spike S3).
    // No lugar do minimizar nativo, a UI tem "esconder na bandeja", que mantém o fps.
    minimizable: false,
    title: 'Deck Chat',
    backgroundColor: '#0e0e10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    if (!startHidden) win.show()
  })

  // a UI própria nunca navega nem abre popups
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  return win
}
