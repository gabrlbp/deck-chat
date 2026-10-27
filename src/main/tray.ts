import { Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from 'electron'

// Ícone provisório desenhado em memória (círculo roxo). Trocar por resources/tray.ico depois.
function makeIcon(size: number): NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const r = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r)
      const alpha = Math.max(0, Math.min(1, r - d)) * 255
      const i = (y * size + x) * 4
      // BGRA
      buf[i] = 0xff
      buf[i + 1] = 0x46
      buf[i + 2] = 0x91
      buf[i + 3] = alpha
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

export function createTray(win: BrowserWindow, onQuit: () => void): Tray {
  const tray = new Tray(makeIcon(32))
  const show = () => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  tray.setToolTip('Deck Chat')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar', click: show },
      { type: 'separator' },
      { label: 'Sair', click: onQuit },
    ]),
  )
  tray.on('click', show)
  return tray
}
