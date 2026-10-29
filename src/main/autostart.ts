import { app } from 'electron'
import type { SystemConfig } from '../shared/schemas'
import { log } from './logger'

/** Só faz sentido no app instalado no Windows; em dev registraria o electron.exe. */
export const autoStartSupported = () => process.platform === 'win32' && app.isPackaged

export function applyAutoStart(system: SystemConfig): void {
  if (!autoStartSupported()) return
  app.setLoginItemSettings({
    openAtLogin: system.startWithWindows,
    args: system.startHidden ? ['--hidden'] : [],
  })
  log(`iniciar com o Windows: ${system.startWithWindows ? 'ligado' : 'desligado'}${system.startHidden ? ' (na bandeja)' : ''}`)
}
