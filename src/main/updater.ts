import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { UpdateState, UpdateStatus } from '../shared/ipc'
import { log } from './logger'

/** primeira checagem depois que os slots carregaram */
const FIRST_CHECK_MS = 60_000
const CHECK_EVERY_MS = 6 * 60 * 60_000

/**
 * Só o app instalado pelo NSIS se atualiza: ele tem o desinstalador ao lado do .exe.
 * O zip portátil e o modo de desenvolvimento ficam de fora.
 */
function isInstalledBuild(): boolean {
  if (!app.isPackaged || process.platform !== 'win32') return false
  try {
    return readdirSync(dirname(process.execPath)).some((f) => /^Uninstall .*\.exe$/i.test(f))
  } catch {
    return false
  }
}

/**
 * F9: atualização automática pelos Releases do GitHub (repo público).
 * Baixa em segundo plano e avisa; instala ao clicar em "Atualizar e reiniciar" ou ao sair pelo menu.
 */
export class Updater {
  private state: UpdateState
  private readonly onChange: () => void
  private readonly beforeInstall: () => void

  /** `beforeInstall` libera o fechamento da janela (que normalmente só esconde na bandeja). */
  constructor(onChange: () => void, beforeInstall: () => void) {
    this.onChange = onChange
    this.beforeInstall = beforeInstall
    this.state = { kind: isInstalledBuild() ? 'idle' : 'unsupported', current: app.getVersion() }
  }

  get snapshot(): UpdateState {
    return this.state
  }

  start(): void {
    if (this.state.kind === 'unsupported') {
      log('atualização automática: desligada (só no app instalado no Windows)')
      return
    }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (m: unknown) => log(`[atualização] ${String(m)}`),
      warn: (m: unknown) => log(`[atualização] aviso: ${String(m)}`),
      error: (m: unknown) => log(`[atualização] erro: ${String(m)}`),
      debug: () => {},
    }

    autoUpdater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ kind: 'latest', checkedAt: Date.now() }))
    autoUpdater.on('update-available', (info) => this.set({ kind: 'downloading', version: info.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => {
      if (this.state.kind === 'downloading') this.set({ ...this.state, percent: Math.round(p.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      log(`[atualização] versão ${info.version} baixada, pronta para instalar`)
      this.set({ kind: 'ready', version: info.version })
    })
    autoUpdater.on('error', (err) => {
      // sem internet ou GitHub fora do ar: tenta de novo na próxima rodada. Uma versão já baixada continua valendo
      if (this.state.kind === 'ready') return
      this.set({ kind: 'error', message: err.message.split('\n')[0] ?? String(err), checkedAt: Date.now() })
    })

    setTimeout(() => this.check(), FIRST_CHECK_MS)
    setInterval(() => this.check(), CHECK_EVERY_MS)
  }

  check(): void {
    if (this.state.kind === 'unsupported' || this.state.kind === 'downloading' || this.state.kind === 'ready') return
    autoUpdater.checkForUpdates().catch(() => {
      // o evento 'error' já registrou
    })
  }

  install(): void {
    if (this.state.kind !== 'ready') return
    log(`[atualização] instalando ${this.state.version} e reiniciando`)
    this.beforeInstall()
    // silencioso (mesma pasta da instalação atual) e abre o app de novo no fim
    autoUpdater.quitAndInstall(true, true)
  }

  private set(next: UpdateStatus): void {
    this.state = { ...next, current: app.getVersion() }
    this.onChange()
  }
}
