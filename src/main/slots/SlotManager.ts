import { randomUUID } from 'node:crypto'
import { WebContentsView, session, type BrowserWindow, type Session } from 'electron'
import type { GameEvent, SlotGameInfo, SlotSnapshot, SlotState, SlotStatus } from '../../shared/ipc'
import type { Bounds, Config, SlotConfig, SlotId } from '../../shared/schemas'
import type { EventDraft } from '../game/events'
import { log } from '../logger'
import { GameTap } from './GameTap'
import { applySlotPolicy } from './policy'
import { nextRecovery, retryDelay, startRecovery, type Recovery } from './recovery'

type Slot = {
  view: WebContentsView | null
  tap: GameTap | null
  status: SlotStatus
  bounds: Bounds
  msgsPerMin?: number
  crashReload?: NodeJS.Timeout
  failedAt?: number
  /** recarregado pelo vigia e o jogo ainda não voltou a mandar mensagens (B2) */
  recovery?: Recovery
  /** último recarregamento por limite de memória (F8) */
  memoryReloadAt?: number
  /** até quando um .csv baixado pela página é da exportação automática (F11) */
  ignoreDownloadUntil?: number
}

const HIDDEN: Bounds = { x: 0, y: 0, width: 0, height: 0 }
const CRASH_RELOAD_MS = 3000
/** Página que falhou ao carregar (ex.: internet caiu) é tentada de novo a cada minuto. */
const ERROR_RETRY_MS = 60_000
/** O servidor manda ~60–90 mensagens/min por alt (S3); 3 min de silêncio = jogo parado. */
const UNRESPONSIVE_MS = 3 * 60_000
const IGNORE_DOWNLOAD_MS = 60_000
/** As fotos do modal ficam desfocadas: metade da resolução e JPEG bastam. */
const SNAPSHOT_SCALE = 0.5
const SNAPSHOT_QUALITY = 70

export class SlotManager {
  private readonly win: BrowserWindow
  private readonly config: Config
  private readonly persist: () => void
  private readonly onChange: () => void
  private readonly onEvent: (event: GameEvent) => void
  private readonly onMarket: (id: SlotId, msg: Record<string, unknown>) => void
  /** sessões que já têm o tratamento de downloads: elas sobrevivem a desativar e religar o slot */
  private readonly downloadGuarded = new Set<SlotId>()
  private readonly slots = new Map<SlotId, Slot>()
  private visible = true
  /** modo foco (F6): só este slot aparece; os outros ficam escondidos e rodando */
  private focus: SlotId | null = null

  constructor(
    win: BrowserWindow,
    config: Config,
    persist: () => void,
    onChange: () => void,
    onEvent: (event: GameEvent) => void,
    onMarket: (id: SlotId, msg: Record<string, unknown>) => void,
  ) {
    this.win = win
    this.config = config
    this.persist = persist
    this.onChange = onChange
    this.onEvent = onEvent
    this.onMarket = onMarket
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
      return { ...cfg, status: slot.status, game: this.gameInfo(slot), retryAt: slot.recovery?.nextAt }
    })
  }

  /** Dados do jogo de cada slot ativo (ex.: lista oficial de canais da Kick). */
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

  setLabel(id: SlotId, label: string): void {
    this.cfg(id).label = label
    this.persist()
    this.onChange()
  }

  /** Esconde as views nativas para a UI ficar por cima (F4). O jogo continua rodando. */
  setVisible(visible: boolean): void {
    this.visible = visible
    for (const cfg of this.config.slots) this.applyVisibility(cfg.id)
  }

  /** Situação de cada slot ativo para o recarregamento por limite de memória (F8). */
  guardInfo(windowFocused: boolean): { id: SlotId; pid: number; ok: boolean; inUse: boolean; lastReloadAt?: number }[] {
    return this.processIds().map(({ id, pid }) => {
      const slot = this.slot(id)
      return {
        id,
        pid,
        ok: slot.status === 'ok' && !slot.recovery,
        inUse: windowFocused && this.isShown(id),
        lastReloadAt: slot.memoryReloadAt,
      }
    })
  }

  reloadForMemory(id: SlotId, memoryMb: number, limitMb: number): void {
    const slot = this.slot(id)
    if (!slot.view) return
    slot.memoryReloadAt = Date.now()
    log(`[${id}] usando ${Math.round(memoryMb)} MB (limite ${limitMb} MB), recarregando para liberar memória`)
    slot.view.webContents.reload()
  }

  /**
   * Alt para os pedidos que o app faz ao jogo (F11): slot funcionando, com o jogo respondendo e que sabidamente
   * não é a main (`kick.vinculado`). Sem o bloco `kick`, não dá para saber quem é: fica de fora.
   */
  altForRequests(): SlotId | null {
    const now = Date.now()
    for (const cfg of this.config.slots) {
      const slot = this.slot(cfg.id)
      const snapshot = slot.tap?.game.snapshot
      const silent = slot.tap?.silentForMs(now) ?? null
      if (slot.status === 'ok' && !slot.recovery && silent !== null && silent < UNRESPONSIVE_MS && snapshot?.nick && snapshot.kick?.vinculado === false) {
        return cfg.id
      }
    }
    return null
  }

  async sendToGame(id: SlotId, message: Record<string, unknown>): Promise<boolean> {
    const tap = this.slot(id).tap
    if (!tap) return false
    log(`[${id}] pedido ao jogo: ${String(message['t'])}`)
    return tap.send(message, new URL(this.config.gameUrl).hostname)
  }

  /** A página do jogo baixa a planilha ao receber a resposta: na exportação automática, esse arquivo é descartado. */
  ignoreNextDownload(id: SlotId): void {
    this.slot(id).ignoreDownloadUntil = Date.now() + IGNORE_DOWNLOAD_MS
  }

  private guardDownloads(id: SlotId, ses: Session): void {
    if (this.downloadGuarded.has(id)) return
    this.downloadGuarded.add(id)
    ses.on('will-download', (event, item) => {
      const slot = this.slot(id)
      if ((slot.ignoreDownloadUntil ?? 0) < Date.now() || !item.getFilename().endsWith('.csv')) return
      slot.ignoreDownloadUntil = undefined
      event.preventDefault()
      log(`[${id}] download automático da planilha descartado (os dados já foram lidos)`)
    })
  }

  /** PID do processo de cada slot ativo, para o medidor de memória. */
  processIds(): { id: SlotId; nick?: string; pid: number }[] {
    return this.config.slots.flatMap((cfg) => {
      const slot = this.slot(cfg.id)
      if (!slot.view || slot.view.webContents.isDestroyed()) return []
      const pid = slot.view.webContents.getOSProcessId()
      return pid ? [{ id: cfg.id, nick: slot.tap?.game.snapshot.nick, pid }] : []
    })
  }

  setFocus(id: SlotId | null): void {
    if (this.focus === id) return
    this.focus = id
    for (const cfg of this.config.slots) this.applyVisibility(cfg.id)
    log(id ? `[${id}] em foco` : 'foco desligado')
  }

  /** O jogo do slot está na tela: UI liberada e (no modo foco) é o slot focado. */
  private isShown(id: SlotId): boolean {
    return this.visible && (this.focus === null || this.focus === id)
  }

  private applyVisibility(id: SlotId): void {
    this.slot(id).view?.setVisible(this.isShown(id))
  }

  async capture(): Promise<SlotSnapshot[]> {
    const shots = await Promise.all(
      this.config.slots.map(async (cfg): Promise<SlotSnapshot | null> => {
        const slot = this.slot(cfg.id)
        // só o que está na tela: jogo escondido (tela preta) ou fora do foco não tem o que fotografar,
        // e os bounds de um slot fora do foco são da posição antiga no grid
        if (!slot.view || !this.isShown(cfg.id) || slot.bounds.width === 0 || slot.bounds.height === 0) return null
        try {
          const image = await slot.view.webContents.capturePage()
          const small = image.resize({ width: Math.max(1, Math.round(slot.bounds.width * SNAPSHOT_SCALE)) })
          const dataUrl = `data:image/jpeg;base64,${small.toJPEG(SNAPSHOT_QUALITY).toString('base64')}`
          return { id: cfg.id, dataUrl, bounds: slot.bounds }
        } catch (err) {
          log(`[${cfg.id}] falha ao capturar a tela do slot: ${String(err)}`)
          return null
        }
      }),
    )
    return shots.filter((shot) => shot !== null)
  }

  /** "Desloga" o slot: apaga cookies, storage e cache da partition e recarrega. */
  async clearSession(id: SlotId): Promise<void> {
    const slot = this.slot(id)
    // tira o jogo da tela antes, para ele não regravar cookies/storage durante a limpeza
    if (slot.view) await slot.view.webContents.loadURL('about:blank')
    const ses = session.fromPartition(`persist:${id}`)
    await ses.clearStorageData()
    await ses.clearCache()
    slot.tap?.game.reset()
    // na tela de login o jogo não manda mensagens: não é caso de recuperação
    slot.recovery = undefined
    log(`[${id}] sessão limpa`)
    if (slot.view) void slot.view.webContents.loadURL(this.config.gameUrl)
    this.onChange()
  }

  /** Chamado periodicamente: atualiza mensagens/min e recarrega slots em silêncio (F1.11). */
  tick(now = Date.now()): void {
    for (const cfg of this.config.slots) {
      const slot = this.slot(cfg.id)
      if (!slot.view || !slot.tap) continue
      slot.msgsPerMin = slot.tap.takeRatePerMin(now)

      if (slot.status === 'error' && slot.failedAt !== undefined && now - slot.failedAt > ERROR_RETRY_MS) {
        log(`[${cfg.id}] tentando carregar de novo após erro`)
        slot.failedAt = undefined
        void slot.view.webContents.loadURL(this.config.gameUrl)
        continue
      }

      const silent = slot.tap.silentForMs(now)

      // B2: o vigia já recarregou; enquanto o jogo não mandar nenhuma mensagem, tenta de novo
      if (slot.recovery) {
        if (silent !== null) {
          log(`[${cfg.id}] jogo voltou a responder após ${slot.recovery.attempt + 1} recarregamento(s)`)
          slot.recovery = undefined
        } else if (slot.status !== 'error' && slot.status !== 'loading' && now >= slot.recovery.nextAt) {
          slot.recovery = nextRecovery(slot.recovery, now)
          log(
            `[${cfg.id}] jogo ainda sem resposta, tentativa ${slot.recovery.attempt + 1}; próxima em ${retryDelay(slot.recovery.attempt) / 60_000} min`,
          )
          slot.view.webContents.reload()
        }
        continue
      }

      if (slot.status === 'ok' && silent !== null && silent > UNRESPONSIVE_MS) {
        log(`[${cfg.id}] sem mensagens do jogo há ${Math.round(silent / 1000)}s, recarregando`)
        this.setStatus(cfg.id, 'unresponsive')
        this.emit(cfg.id, {
          kind: 'problem',
          title: 'Sem resposta do jogo',
          detail: `${Math.round(silent / 60_000)} min sem mensagens do servidor; slot recarregado, tenta de novo até o jogo voltar`,
        })
        slot.recovery = startRecovery(now)
        slot.view.webContents.reload()
      }
    }
    this.onChange()
  }

  /** Desenvolvimento: injeta mensagens gravadas (spike S4) nos slots ativos, como se viessem do jogo. */
  replay(frames: { slot: string; data: string }[]): void {
    for (const frame of frames) {
      const slot = this.slots.get(frame.slot as SlotId)
      slot?.tap?.ingest(frame.data)
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
    view.setVisible(this.isShown(cfg.id))
    slot.view = view
    slot.status = 'loading'

    const wc = view.webContents
    wc.setAudioMuted(cfg.muted)
    applySlotPolicy(wc, this.config.gameUrl, cfg.id)
    const tap = new GameTap(
      wc,
      cfg.id,
      (drafts) => {
        for (const draft of drafts) this.emit(cfg.id, draft)
      },
      (msg) => this.onMarket(cfg.id, msg),
    )
    this.guardDownloads(cfg.id, wc.session)
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
      slot.failedAt = Date.now()
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
    slot.recovery = undefined
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
