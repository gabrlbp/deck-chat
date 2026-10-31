import { app } from 'electron'
import type { SystemConfig } from '../shared/schemas'
import { log } from './logger'

/** Só faz sentido no app instalado no Windows; em dev registraria o electron.exe. */
export const autoStartSupported = () => process.platform === 'win32' && app.isPackaged

export function applyAutoStart(system: SystemConfig): void {
  if (!autoStartSupported()) return
  const args = system.startHidden ? ['--hidden'] : []
  app.setLoginItemSettings({ openAtLogin: system.startWithWindows, args })
  // o que ficou registrado no Windows (diagnóstico do B1)
  const items = app.getLoginItemSettings({ args }).launchItems ?? []
  const registered = items.map((item) => `${item.path} ${item.args.join(' ')}`.trim()).join(' | ') || 'nenhum'
  log(
    `iniciar com o Windows: ${system.startWithWindows ? 'ligado' : 'desligado'}${system.startHidden ? ' (na bandeja)' : ''}; registrado: ${registered}`,
  )
}
