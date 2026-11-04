import { app, BrowserWindow } from 'electron'
import { KICK_PHASES, type KickChannelView, type KickGameView, type KickPhase, type KickState } from '../../shared/kick'
import { spikeCsv, spikeJsonl } from '../diagnostics/spikeLog'
import { log } from '../logger'
import { isVideoRequest } from './hls'
import { applyKickPolicy, KICK, KickSession } from './KickSession'
import { KickWatcher } from './KickWatcher'
import { pickChannels, type OfficialKick } from './select'

const POLL_MS = 60_000
/** desenvolvimento: abre lives sem login (não ganha pontos) para testar vídeo e memória */
const ANON = !app.isPackaged && process.env['DECK_KICK_ANON'] === '1'
const FIRST_POLL_MS = 15_000
const CSV_HEADER = 'time,phase,slug,live,watching,points,gained_phase,video,working_set_mb,private_mb'

/** Anúncios e rastreadores: não fazem parte da live e só gastam memória (lista do Kickterino). */
const BLOCKED_HOSTS = [
  'googlesyndication.com',
  'doubleclick.net',
  'googletagmanager.com',
  'google-analytics.com',
  'googleadservices.com',
  'imasdk.googleapis.com',
  'amazon-adsystem.com',
  'facebook.net',
  'analytics.tiktok.com',
  'criteo.com',
  'criteo.net',
  'adnxs.com',
  'taboola.com',
  'hotjar.com',
  'clarity.ms',
]

export type OfficialChannel = OfficialKick & { nome?: string; espectadores?: number }

type ChannelStatus = { points: number | null; gained: number; apiLive?: boolean; video?: string }

type Deps = {
  /** lista oficial da Kick vinda do jogo (`estado.kick.oficiais`) */
  officials: () => OfficialChannel[]
  /** bloco `kick` de cada slot */
  game: () => KickGameView[]
  onChange: () => void
}

/**
 * Spike S6: mede se a Kick conta pontos com lives abertas dentro do app, quantas valem ao mesmo tempo
 * e quanta memória custam. Sem rodízio nem resgate: a fase fixa a configuração e o CSV registra o resto.
 */
export class KickSpike {
  private readonly session: KickSession
  private readonly deps: Deps
  private phase: KickPhase = 'off'
  private phaseStartedAt?: number
  private readonly watchers = new Map<string, KickWatcher>()
  private readonly status = new Map<string, ChannelStatus>()
  private readonly offline = new Set<string>()
  /** webContents das lives escondidas: sem imagens/fontes e, na fase sem vídeo, sem vídeo */
  private readonly watcherIds = new Map<number, { video: boolean }>()
  private loggedIn: boolean | null = null
  private polledAt?: number
  private problem?: string
  private polling = false

  constructor(deps: Deps) {
    this.deps = deps
    this.session = new KickSession(() => {
      void this.refreshLogin().then(() => this.deps.onChange())
    })
    this.session.ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
      const watcher = details.webContentsId !== undefined ? this.watcherIds.get(details.webContentsId) : undefined
      const blocked =
        BLOCKED_HOSTS.some((h) => details.url.includes(h)) ||
        (watcher !== undefined &&
          (details.resourceType === 'image' || details.resourceType === 'font' || (!watcher.video && isVideoRequest(details.url))))
      cb({ cancel: blocked })
    })
  }

  start(): void {
    void this.refreshLogin().then(() => this.deps.onChange())
    setTimeout(() => {
      void this.poll()
      setInterval(() => void this.poll(), POLL_MS)
    }, FIRST_POLL_MS)
  }

  state(): KickState {
    const officials = this.deps.officials()
    const known = new Map(officials.map((o) => [o.slug, o]))
    // oficiais na ordem do jogo + lives abertas que tenham saído da lista
    const slugs = [...officials.map((o) => o.slug), ...[...this.watchers.keys()].filter((s) => !known.has(s))]
    const memory = this.memoryByPid()
    const channels: KickChannelView[] = slugs.map((slug) => {
      const o = known.get(slug)
      const s = this.status.get(slug)
      const w = this.watchers.get(slug)
      const pid = w?.pid()
      return {
        slug,
        nome: o?.nome ?? slug,
        live: s?.apiLive ?? o?.aoVivo ?? null,
        viewers: o?.espectadores,
        watching: w !== undefined,
        points: s?.points ?? null,
        gained: s?.gained ?? 0,
        watchingSince: w?.since,
        video: w ? s?.video : undefined,
        memoryMb: pid ? memory.get(pid)?.mb : undefined,
      }
    })
    return {
      login: this.loggedIn === null ? 'unknown' : this.loggedIn ? 'logged-in' : 'logged-out',
      loggingIn: this.session.loggingIn,
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      channels,
      game: this.deps.game(),
      polledAt: this.polledAt,
      problem: this.problem,
    }
  }

  /** pid → nome, para a tabela de memória em Sobre */
  processLabels(): Map<number, string> {
    const labels = new Map<number, string>()
    const api = this.session.apiPid()
    if (api) labels.set(api, 'kick · consultas')
    for (const w of this.watchers.values()) {
      const pid = w.pid()
      if (pid) labels.set(pid, `kick · ${w.slug}`)
    }
    return labels
  }

  login(): void {
    this.session.openLogin()
  }

  async logout(): Promise<void> {
    this.setPhase('off')
    await this.session.logout()
    this.status.clear()
  }

  setPhase(phase: KickPhase): void {
    if (phase === this.phase) return
    log(`[kick] fase ${this.phase} → ${phase} (${KICK_PHASES[phase].label})`)
    this.phase = phase
    this.phaseStartedAt = phase === 'off' ? undefined : Date.now()
    for (const s of this.status.values()) s.gained = 0
    // método novo (vídeo / sem vídeo / janela): reabre tudo
    for (const slug of [...this.watchers.keys()]) this.stopWatcher(slug)
    this.offline.clear()
    this.reconcile()
    this.deps.onChange()
    // lê os saldos logo, para o ganho da fase partir de um número conhecido
    void this.poll()
  }

  /**
   * Fase R: o chat popout da Kick, onde ficam as recompensas do canal. Enquanto está aberto, grava os
   * pedidos à API em logs/s6-kick-net.jsonl, para descobrir como o resgate funciona.
   */
  openStore(slug: string): void {
    const win = new BrowserWindow({
      width: 440,
      height: 760,
      title: `Kick — pontos de ${slug} (gravando)`,
      autoHideMenuBar: true,
      webPreferences: { partition: 'persist:kick' },
    })
    applyKickPolicy(win.webContents)
    this.recordNetwork(win, slug)
    void win.loadURL(`${KICK}/popout/${slug}/chat`)
    log(`[kick] loja de ${slug} aberta (gravando a rede em s6-kick-net.jsonl)`)
    win.on('closed', () => void this.poll())
  }

  dispose(): void {
    for (const slug of [...this.watchers.keys()]) this.stopWatcher(slug)
    this.session.dispose()
  }

  private async refreshLogin(): Promise<void> {
    this.loggedIn = await this.session.isLoggedIn()
  }

  private reconcile(): void {
    const { lives, page, video, window } = KICK_PHASES[this.phase]
    const wanted = this.loggedIn || ANON ? pickChannels(this.deps.officials(), [...this.watchers.keys()], lives, this.offline) : []
    for (const slug of [...this.watchers.keys()]) if (!wanted.includes(slug)) this.stopWatcher(slug)
    for (const slug of wanted) {
      if (this.watchers.has(slug)) continue
      const watcher = new KickWatcher(slug, { page, video, window }, () => {
        if (this.watchers.get(slug) === watcher) this.stopWatcher(slug)
      })
      this.watcherIds.set(watcher.webContentsId, { video })
      this.watchers.set(slug, watcher)
      const what = page === 'chat' ? 'só o chat' : video ? 'vídeo 160p' : 'sem vídeo'
      log(`[kick] abrindo ${slug} (${what}, janela ${window === 'hidden' ? 'escondida' : 'transparente'})`)
    }
  }

  private stopWatcher(slug: string): void {
    const w = this.watchers.get(slug)
    if (!w) return
    this.watchers.delete(slug)
    this.watcherIds.delete(w.webContentsId)
    log(`[kick] fechando ${slug} (aberta por ${Math.round((Date.now() - w.since) / 60_000)} min)`)
    w.close()
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      await this.refreshLogin()
      if (!this.loggedIn && !ANON) {
        this.problem = undefined
        return
      }
      const officials = this.deps.officials()
      const slugs = new Set([...officials.map((o) => o.slug), ...this.watchers.keys()])
      let failures = 0
      for (const slug of slugs) {
        const s = this.status.get(slug) ?? { points: null, gained: 0 }
        try {
          const { status, json } = await this.session.fetch(`/api/v2/channels/${slug}/points`)
          const data = json as { data?: { points?: unknown }; points?: unknown } | null
          const p = data?.data?.points ?? data?.points
          if (status === 200 && typeof p === 'number') {
            if (s.points !== null && p > s.points && this.phase !== 'off') s.gained += p - s.points
            s.points = p
          } else {
            failures++
          }
          if (this.watchers.has(slug)) {
            const channel = await this.session.fetch(`/api/v2/channels/${slug}`)
            const live = (channel.json as { livestream?: unknown } | null)?.livestream
            if (channel.status === 200) {
              s.apiLive = Boolean(live)
              if (!live) this.offline.add(slug)
            }
          }
        } catch (err) {
          failures++
          log(`[kick] falha ao ler ${slug}: ${String(err instanceof Error ? err.message : err)}`)
        }
        this.status.set(slug, s)
      }
      this.problem = failures && failures === slugs.size ? 'nenhum canal respondeu (Kick fora do ar ou sessão expirada?)' : undefined
      this.polledAt = Date.now()
      this.reconcile()
      for (const [slug, w] of this.watchers) {
        const s = this.status.get(slug)
        if (s) s.video = await w.probe()
      }
      this.writeCsv()
    } finally {
      this.polling = false
      this.deps.onChange()
    }
  }

  private memoryByPid(): Map<number, { ws: number; priv?: number; mb: number }> {
    const map = new Map<number, { ws: number; priv?: number; mb: number }>()
    for (const m of app.getAppMetrics()) {
      const ws = m.memory.workingSetSize / 1024
      const priv = m.memory.privateBytes !== undefined ? m.memory.privateBytes / 1024 : undefined
      map.set(m.pid, { ws, priv, mb: priv ?? ws })
    }
    return map
  }

  private writeCsv(): void {
    if (this.phase === 'off' && this.watchers.size === 0) return
    const time = new Date().toISOString()
    const memory = this.memoryByPid()
    const fmt = (n: number | undefined) => (n === undefined ? '' : n.toFixed(1))
    const rows = this.state().channels
      .filter((c) => c.points !== null || c.watching)
      .map((c) => {
        const pid = this.watchers.get(c.slug)?.pid()
        const mem = pid ? memory.get(pid) : undefined
        const video = (c.video ?? '').replaceAll(',', ' ')
        return [time, this.phase, c.slug, c.live ?? '', c.watching, c.points ?? '', c.gained, video, fmt(mem?.ws), fmt(mem?.priv)].join(',')
      })
    const apiPid = this.session.apiPid()
    const api = apiPid ? memory.get(apiPid) : undefined
    if (api) rows.push([time, this.phase, '(consultas)', '', '', '', '', '', fmt(api.ws), fmt(api.priv)].join(','))
    spikeCsv('s6-kick', CSV_HEADER, rows)
  }

  private recordNetwork(win: BrowserWindow, slug: string): void {
    const dbg = win.webContents.debugger
    try {
      dbg.attach('1.3')
    } catch {
      return
    }
    const tracked = new Map<string, { method: string; url: string }>()
    dbg.on('message', (_e, method, params) => {
      const p = params as Record<string, unknown>
      if (method === 'Network.requestWillBeSent') {
        const req = p['request'] as { method: string; url: string; postData?: string }
        if (!req.url.includes('/api/') && req.method === 'GET') return
        if (!/kick\.com/.test(req.url)) return
        tracked.set(p['requestId'] as string, { method: req.method, url: req.url })
        // só método, URL e corpo: os cabeçalhos levam o token da sessão
        spikeJsonl('s6-kick-net', { slug, kind: 'request', method: req.method, url: req.url, body: req.postData })
      } else if (method === 'Network.responseReceived') {
        const t = tracked.get(p['requestId'] as string)
        const res = p['response'] as { status: number }
        if (t) spikeJsonl('s6-kick-net', { slug, kind: 'response', ...t, status: res.status })
      } else if (method === 'Network.loadingFinished') {
        const id = p['requestId'] as string
        const t = tracked.get(id)
        if (!t) return
        tracked.delete(id)
        dbg
          .sendCommand('Network.getResponseBody', { requestId: id })
          .then((r: { body: string }) => spikeJsonl('s6-kick-net', { slug, kind: 'body', ...t, body: r.body.slice(0, 8000) }))
          .catch(() => {})
      } else if (method === 'Network.webSocketFrameReceived') {
        const data = (p['response'] as { payloadData: string }).payloadData
        if (/Reward|Redeem|Points/i.test(data)) spikeJsonl('s6-kick-net', { slug, kind: 'ws', data: data.slice(0, 8000) })
      }
    })
    void dbg.sendCommand('Network.enable').catch(() => {})
  }
}
