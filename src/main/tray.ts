import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import trayIconPath from '../../resources/tray.png?asset'
import trayWarnIconPath from '../../resources/tray-warn.png?asset'

/** Problema passageiro (ex.: reconexão de poucos segundos) não deve piscar o ícone. */
const WARN_AFTER_MS = 30_000

export type TrayStatus = { lines: string[]; degraded: boolean }

export class AppTray {
  private readonly tray: Tray
  private readonly win: BrowserWindow
  private readonly onQuit: () => void
  private readonly icon = nativeImage.createFromPath(trayIconPath)
  private readonly warnIcon = nativeImage.createFromPath(trayWarnIconPath)
  private degradedSince: number | null = null
  private lastKey = ''

  constructor(win: BrowserWindow, onQuit: () => void) {
    this.win = win
    this.onQuit = onQuit
    this.tray = new Tray(this.icon)
    this.tray.on('click', () => this.show())
    this.update({ lines: [], degraded: false })
  }

  update(status: TrayStatus, now = Date.now()): void {
    if (!status.degraded) this.degradedSince = null
    else this.degradedSince ??= now
    const warn = this.degradedSince !== null && now - this.degradedSince >= WARN_AFTER_MS

    const key = JSON.stringify([status.lines, warn])
    if (key === this.lastKey) return
    this.lastKey = key

    this.tray.setImage(warn ? this.warnIcon : this.icon)
    this.tray.setToolTip(['Deck Chat', ...status.lines].join('\n'))
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Mostrar Deck Chat', click: () => this.show() },
        ...(status.lines.length ? [{ type: 'separator' as const }] : []),
        ...status.lines.map((label) => ({ label, enabled: false })),
        { type: 'separator' },
        { label: 'Sair', click: this.onQuit },
      ]),
    )
  }

  private show(): void {
    if (this.win.isMinimized()) this.win.restore()
    this.win.show()
    this.win.focus()
  }
}
