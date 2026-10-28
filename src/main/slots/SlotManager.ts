import { randomUUID } from 'node:crypto'
import { WebContentsView, type BrowserWindow } from 'electron'
import type { GameEvent, SlotGameInfo, SlotState, SlotStatus } from '../../shared/ipc'
import type { Bounds, Config, SlotConfig, SlotId } from '../../shared/schemas'
import type { EventDraft } from '../game/events'
import { ballsLeft } from '../game/GameState'
import { log } from '../logger'
import { GameTap } from './GameTap'
import { applySlotPolicy } from './policy'

type Slot = {
  view: WebContentsView | null
  tap: GameTap | null
  status: SlotStatus
  bounds: Bounds
  msgsPerMin?: number
  crashReload?: NodeJS.Timeout
}

const HIDDEN: Bounds = { x: 0, y: 0, width: 0, height: 0 }
const CRASH_RELOAD_MS = 3000
/** O servidor manda ~60–90 mensagens/min por alt (S3); 3 min de silêncio = jogo parado. */
const UNRESPONSIVE_MS = 3 * 60_000

export class SlotManager {
  private readonly win: BrowserWindow
  private readonly config: Config
  private readonly persist: () => void
  private readonly onChange: () => void
  private readonly onEvent: (event: GameEvent) => void
  private readonly slots = new Map<SlotId, Slot>()

  constructor(
    win: BrowserWindow,
    config: Config,
    persist: () => void,
    onChange: () => void,
    onEvent: (event: GameEvent) => void,
  ) {
    this.win = win
    this.config = config
    this.persist = persist
    this.onChange = onChange
    this.onEvent = onEvent
    for (const cfg of config.slots) {
      this.slots.set(cfg.id, { view: null, tap: null, status: 'disabled', bounds: HIDDEN })
    }
  }

  start(): void {
    for (const cfg of this.config.slots) if (cfg.enabled) this.create(cfg)
    this.onChange()
  }

  states(): SlotState[] {
    return this.config.slots.map((cfg) => {
      const slot = this.slot(cfg.id)
      return { ...cfg, status: slot.status, game: this.gameInfo(slot) }
    })
  }

  /** Dados do jogo de cada slot ativo (ex.: lista oficial de streamers para a Twitch). */
  snapshots() {
    return this.config.slots.flatMap((cfg) => {
      const tap = this.slot(cfg.id).tap
      return tap ? [{ id: cfg.id, snapshot: tap.game.snapshot }] : []
    })
  }

  setEnabled(id: SlotId, enabled: boolean): void {
    const cfg = this.cfg(id)
    if (cfg.enabled === enabled) return
    cfg.enabled = enabled
    this.persist()
    if (enabled) this.create(cfg)
    else this.destroy(id)
    log(`[${id}] ${enabled ? 'ativado' : 'desativado'}`)
    this.onChange()
  }

  setBounds(id: SlotId, bounds: Bounds): void {
    const slot = this.slot(id)
    slot.bounds = bounds
    slot.view?.setBounds(bounds)
  }

  setMuted(id: SlotId, muted: boolean): void {
    this.cfg(id).muted = muted
    this.persist()
    this.slot(id).view?.webContents.setAudioMuted(muted)
    this.onChange()
  }

  setZoom(id: SlotId, zoom: number): void {
    this.cfg(id).zoom = zoom
    this.persist()
    this.slot(id).view?.webContents.setZoomFactor(zoom)
    this.onChange()
  }

  reload(id: SlotId): void {
    this.slot(id).view?.webContents.reload()
  }

  /** Chamado periodicamente: atualiza mensagens/min e recarrega slots em silêncio (F1.11). */
  tick(now = Date.now()): void {
    for (const cfg of this.config.slots) {
      const slot = this.slot(cfg.id)
      if (!slot.view || !slot.tap) continue
      slot.msgsPerMin = slot.tap.takeRatePerMin(now)

      const silent = slot.tap.silentForMs(now)
      if (slot.status === 'ok' && silent !== null && silent > UNRESPONSIVE_MS) {
        log(`[${cfg.id}] sem mensagens do jogo há ${Math.round(silent / 1000)}s, recarregando`)
        this.setStatus(cfg.id, 'unresponsive')
        this.emit(cfg.id, {
          kind: 'problem',
          title: 'Sem resposta do jogo',
          detail: `${Math.round(silent / 60_000)} min sem mensagens do servidor, slot recarregado`,
        })
        slot.view.webContents.reload()
      }
    }
    this.onChange()
  }

  destroyAll(): void {
    for (const cfg of this.config.slots) this.destroy(cfg.id)
  }

  private gameInfo(slot: Slot): SlotGameInfo {
    const s = slot.tap?.game.snapshot
    if (!s) return {}
    return {
      nick: s.nick,
      level: s.level,
      hunt: s.hunt ?? undefined,
      balls: ballsLeft(s),
      msgsPerMin: slot.msgsPerMin,
    }
  }

  private emit(id: SlotId, draft: EventDraft): void {
    const event: GameEvent = {
      ...draft,
      id: randomUUID(),
      at: Date.now(),
      slot: id,
      nick: this.slot(id).tap?.game.snapshot.nick,
    }
    this.onEvent(event)
  }

  private create(cfg: SlotConfig): void {
    const slot = this.slot(cfg.id)
    if (slot.view) return

    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:${cfg.id}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    view.setBackgroundColor('#18181b')
    view.setBounds(slot.bounds)
    slot.view = view
    slot.status = 'loading'

    const wc = view.webContents
    wc.setAudioMuted(cfg.muted)
    applySlotPolicy(wc, this.config.gameUrl, cfg.id)
    const tap = new GameTap(wc, cfg.id, (drafts) => {
      for (const draft of drafts) this.emit(cfg.id, draft)
    })
    slot.tap = tap

    // só a navegação da página principal conta; iframes e pushState não mudam o status
    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      tap.resetForNavigation()
      this.setStatus(cfg.id, 'loading')
    })
    wc.on('did-finish-load', () => {
      wc.setZoomFactor(this.cfg(cfg.id).zoom)
      void tap.ensureAttached()
      log(`[${cfg.id}] carregado: ${wc.getURL()} "${wc.getTitle()}"`)
      this.setStatus(cfg.id, 'ok')
    })
    wc.on('did-stop-loading', () => {
      if (slot.status === 'loading') this.setStatus(cfg.id, 'ok')
    })
    wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      // -3 = ERR_ABORTED (navegação substituída por outra), não é erro de verdade
      if (!isMainFrame || code === -3) return
      log(`[${cfg.id}] falha ao carregar ${url}: ${code} ${description}`)
      this.setStatus(cfg.id, 'error')
    })
    wc.on('unresponsive', () => log(`[${cfg.id}] página não responde`))
    wc.on('responsive', () => log(`[${cfg.id}] página voltou a responder`))
    wc.on('render-process-gone', (_event, details) => {
      log(`[${cfg.id}] processo do slot caiu: ${details.reason} (exit ${details.exitCode}), recarregando em ${CRASH_RELOAD_MS / 1000}s`)
      this.setStatus(cfg.id, 'crashed')
      clearTimeout(slot.crashReload)
      slot.crashReload = setTimeout(() => {
        if (slot.view === view) wc.reload()
      }, CRASH_RELOAD_MS)
    })

    this.win.contentView.addChildView(view)
    // não esperar: o Network.enable só responde depois que a página existe
    void tap.ensureAttached()
    void wc.loadURL(this.config.gameUrl)
    log(`[${cfg.id}] criado (partition persist:${cfg.id})`)
  }

  private destroy(id: SlotId): void {
    const slot = this.slot(id)
    if (!slot.view) return
    clearTimeout(slot.crashReload)
    this.win.contentView.removeChildView(slot.view)
    slot.view.webContents.close()
    slot.view = null
    slot.tap = null
    slot.status = 'disabled'
    slot.msgsPerMin = undefined
  }

  private setStatus(id: SlotId, status: SlotStatus): void {
    const slot = this.slot(id)
    if (slot.status === status) return
    slot.status = status
    this.onChange()
  }

  private slot(id: SlotId): Slot {
    const slot = this.slots.get(id)
    if (!slot) throw new Error(`slot desconhecido: ${id}`)
    return slot
  }

  private cfg(id: SlotId): SlotConfig {
    const cfg = this.config.slots.find((s) => s.id === id)
    if (!cfg) throw new Error(`slot desconhecido: ${id}`)
    return cfg
  }
}
