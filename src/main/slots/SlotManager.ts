import { WebContentsView, type BrowserWindow } from 'electron'
import type { Bounds, Config, SlotConfig, SlotId } from '../../shared/schemas'
import type { ProbeSample, SlotState, SlotStatus, WindowMode } from '../../shared/ipc'
import { appendCsv, log } from '../logger'
import { ActivityMonitor } from './activity'
import { applySlotPolicy } from './policy'
import { installProbe, readProbe } from './probe'
import type { WsRecorder } from './recorder'

type Slot = {
  view: WebContentsView | null
  activity: ActivityMonitor | null
  status: SlotStatus
  title?: string
  bounds: Bounds
  probe?: ProbeSample
  crashReload?: NodeJS.Timeout
}

const HIDDEN: Bounds = { x: 0, y: 0, width: 0, height: 0 }
const CRASH_RELOAD_MS = 3000

export class SlotManager {
  private readonly win: BrowserWindow
  private readonly config: Config
  private readonly persist: () => void
  private readonly onChange: () => void
  private readonly recorder: WsRecorder
  private readonly slots = new Map<SlotId, Slot>()

  constructor(win: BrowserWindow, config: Config, persist: () => void, onChange: () => void, recorder: WsRecorder) {
    this.win = win
    this.config = config
    this.persist = persist
    this.onChange = onChange
    this.recorder = recorder
    for (const cfg of config.slots) {
      this.slots.set(cfg.id, { view: null, activity: null, status: 'disabled', bounds: HIDDEN })
    }
  }

  start(): void {
    for (const cfg of this.config.slots) if (cfg.enabled) this.create(cfg)
    this.onChange()
  }

  states(): SlotState[] {
    return this.config.slots.map((cfg) => {
      const slot = this.slot(cfg.id)
      return { ...cfg, status: slot.status, title: slot.title, probe: slot.probe }
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

  async probeAll(windowMode: WindowMode): Promise<void> {
    for (const cfg of this.config.slots) {
      const slot = this.slot(cfg.id)
      if (!slot.view || slot.status !== 'ok') continue
      try {
        const raw = await readProbe(slot.view.webContents)
        const net = slot.activity?.take() ?? { http: 0, wsSent: 0, wsRecv: 0 }
        if (!raw || raw.ms < 1000) continue
        const seconds = raw.ms / 1000
        const perMin = (n: number) => (n * 60) / seconds
        slot.probe = {
          at: Date.now(),
          timerRatio: raw.ticks / seconds,
          fps: raw.frames / seconds,
          visibility: raw.visibility,
          windowMode,
          httpPerMin: perMin(net.http),
          wsSentPerMin: perMin(net.wsSent),
          wsRecvPerMin: perMin(net.wsRecv),
        }
        appendCsv(
          's3-probe-v2.csv',
          'time,slot,window_mode,visibility,timer_ratio,fps,http_min,ws_sent_min,ws_recv_min',
          [
            new Date(slot.probe.at).toISOString(),
            cfg.id,
            windowMode,
            raw.visibility,
            slot.probe.timerRatio.toFixed(3),
            slot.probe.fps.toFixed(1),
            slot.probe.httpPerMin.toFixed(1),
            slot.probe.wsSentPerMin.toFixed(1),
            slot.probe.wsRecvPerMin.toFixed(1),
          ].join(','),
        )
      } catch (err) {
        log(`[${cfg.id}] falha ao ler probe: ${String(err)}`)
      }
    }
    this.onChange()
  }

  destroyAll(): void {
    for (const cfg of this.config.slots) this.destroy(cfg.id)
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
    const activity = new ActivityMonitor(wc, cfg.id, this.recorder)
    slot.activity = activity

    // só a navegação da página principal conta; iframes e pushState não mudam o status
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.setStatus(cfg.id, 'loading')
    })
    wc.on('did-finish-load', () => {
      wc.setZoomFactor(this.cfg(cfg.id).zoom)
      installProbe(wc).catch((err) => log(`[${cfg.id}] falha ao instalar probe: ${String(err)}`))
      void activity.ensureAttached()
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
    wc.on('page-title-updated', (_event, title) => {
      slot.title = title
      this.onChange()
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
    void activity.ensureAttached()
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
    slot.activity = null
    slot.status = 'disabled'
    slot.title = undefined
    slot.probe = undefined
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
