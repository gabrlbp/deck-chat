import { app, BrowserWindow, session, type Session } from 'electron'
import { TWITCH_PHASES, type TwitchChannelView, type TwitchPhase, type TwitchState } from '../../shared/twitch'
import { redactSecrets, spikeCsv, spikeJsonl } from '../diagnostics/spikeLog'
import { log } from '../logger'
import { LiveWatcher } from '../live/LiveWatcher'
import { applyLivePolicy, trustedDomains } from '../live/policy'
import { pickWatched } from './select'
import { parsePointsGain } from './points'

const TWITCH = 'https://www.twitch.tv'
const PARTITION = 'persist:twitch'
const POLL_MS = 60_000
/** a coluna do chat, onde ficam o saldo e o baú, some em janelas estreitas */
const WATCHER_SIZE = { width: 1280, height: 720 }
const CSV_HEADER = 'time,phase,login,live,watching,balance,chests,video,working_set_mb,private_mb,gained_phase'
/** pedidos e mensagens que interessam para entender os pontos e o resgate */
const POINTS_RE = /Redeem|CommunityPoint|ChannelPoint|Claim|points-earned|claim-available|claim-claimed|reward-redeemed/i

const isTrusted = trustedDomains(['twitch.tv'])
const applyPolicy = (wc: Electron.WebContents) => applyLivePolicy(wc, PARTITION, isTrusted)

/** desenvolvimento: abre lives sem login (não ganha pontos), para testar sem a conta */
const ANON = !app.isPackaged && process.env['DECK_LIVE_ANON'] === '1'

export type GameTwitch = {
  slot: string
  vinculado?: boolean
  login?: string | null
  bonus?: Record<string, number>
  oficiais?: { login: string; nome?: string; aoVivo?: boolean; espectadores?: number; ativo?: boolean }[]
}

type ChannelStatus = { balance?: string; chests: number; video?: string; domSaved?: boolean }

type PageInfo = {
  video: string
  balance: string | null
  chestClicked: boolean
  gateClicked: boolean
  /** trecho do HTML dos pontos, gravado uma vez por canal para corrigir seletores sem refazer o teste */
  pointsHtml: string | null
}

const pageScript = (clickChest: boolean) => `(() => {
  const gate = document.querySelector('[data-a-target="content-classification-gate-overlay-start-watching-button"]');
  if (gate) gate.click();
  const v = document.querySelector('video');
  const video = !v ? 'sem player' : (v.paused ? 'pausado' : v.readyState >= 3 ? 'tocando' : 'carregando') + (v.videoHeight ? ' ' + v.videoHeight + 'p' : '');
  const summary = document.querySelector('.community-points-summary, [data-test-selector="community-points-summary"]');
  const balance = document.querySelector('[data-test-selector="copo-balance-string"], [data-test-selector="balance-string"]');
  const icon = document.querySelector('.claimable-bonus__icon');
  const chest = icon ? (icon.closest('button') || icon) : document.querySelector('button[aria-label="Claim Bonus"], button[aria-label="Resgatar Bônus"], button[aria-label="Resgatar bônus"]');
  const click = ${clickChest} && !!chest;
  if (click) chest.click();
  return {
    video,
    balance: balance ? balance.textContent.trim() : null,
    chestClicked: click,
    gateClicked: !!gate,
    pointsHtml: summary ? summary.outerHTML.slice(0, 3000) : null,
  };
})()`

/**
 * Spike S8: mede se a Twitch conta pontos com a live escondida dentro do app, quantas lives valem, quanta
 * memória custam, o baú e como é o resgate. A fase fixa a configuração, como no S6 da Kick.
 */
export class TwitchSpike {
  private readonly ses: Session = session.fromPartition(PARTITION)
  private readonly deps: { blocks: () => GameTwitch[]; onChange: () => void }
  private readonly watchers = new Map<string, LiveWatcher>()
  private readonly status = new Map<string, ChannelStatus>()
  private readonly watcherIds = new Set<number>()
  private readonly seenGains = new Set<string>()
  private phase: TwitchPhase = 'off'
  private phaseStartedAt?: number
  private gainedPhase = 0
  private chestsPhase = 0
  private loggedIn: boolean | null = null
  private loginWin: BrowserWindow | null = null
  private polledAt?: number
  private polling = false

  constructor(deps: { blocks: () => GameTwitch[]; onChange: () => void }) {
    this.deps = deps
    this.ses.setSpellCheckerEnabled(false)
    this.ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen'))
    this.ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
      const hidden = details.webContentsId !== undefined && this.watcherIds.has(details.webContentsId)
      cb({ cancel: hidden && (details.resourceType === 'image' || details.resourceType === 'font') })
    })
  }

  start(): void {
    void this.refreshLogin().then(() => this.deps.onChange())
    setInterval(() => void this.poll(), POLL_MS)
  }

  private officials(): NonNullable<GameTwitch['oficiais']> {
    const blocks = this.deps.blocks()
    return blocks.find((b) => b.vinculado && b.oficiais)?.oficiais ?? blocks.find((b) => b.oficiais)?.oficiais ?? []
  }

  state(): TwitchState {
    const memory = new Map(app.getAppMetrics().map((m) => [m.pid, (m.memory.privateBytes ?? m.memory.workingSetSize) / 1024]))
    const channels: TwitchChannelView[] = this.officials().map((o) => {
      const w = this.watchers.get(o.login)
      const s = this.status.get(o.login)
      const pid = w?.pid()
      return {
        login: o.login,
        nome: o.nome ?? o.login,
        live: o.aoVivo === true,
        ativo: o.ativo === true,
        viewers: o.espectadores,
        watching: w !== undefined,
        balance: s?.balance,
        chests: s?.chests ?? 0,
        watchingSince: w?.since,
        video: w ? s?.video : undefined,
        memoryMb: pid ? memory.get(pid) : undefined,
      }
    })
    return {
      login: this.loggedIn === null ? 'unknown' : this.loggedIn ? 'logged-in' : 'logged-out',
      loggingIn: this.loginWin !== null && !this.loginWin.isDestroyed(),
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      channels,
      gainedPhase: this.gainedPhase,
      chestsPhase: this.chestsPhase,
      game: this.deps.blocks().map(({ slot, vinculado, login, bonus }) => ({ slot, vinculado, login, bonus })),
      polledAt: this.polledAt,
    }
  }

  processLabels(): Map<number, string> {
    const labels = new Map<number, string>()
    for (const [login, w] of this.watchers) {
      const pid = w.pid()
      if (pid) labels.set(pid, `twitch · ${login}`)
    }
    return labels
  }

  login(): void {
    if (this.loginWin && !this.loginWin.isDestroyed()) {
      this.loginWin.focus()
      return
    }
    const win = new BrowserWindow({
      width: 1000,
      height: 760,
      title: 'Twitch — entrar',
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION },
    })
    applyPolicy(win.webContents)
    win.webContents.setAudioMuted(true)
    void win.loadURL(`${TWITCH}/login`)
    win.on('closed', () => {
      this.loginWin = null
      void this.refreshLogin().then(() => {
        log(`[twitch] janela de login fechada · ${this.loggedIn ? 'logado' : 'sem login'}`)
        this.deps.onChange()
      })
    })
    this.loginWin = win
    this.deps.onChange()
  }

  async logout(): Promise<void> {
    this.setPhase('off')
    await this.ses.clearStorageData()
    await this.ses.clearCache()
    await this.ses.clearAuthCache()
    log('[twitch] sessão apagada (sair da conta)')
    await this.refreshLogin()
    this.status.clear()
    this.deps.onChange()
  }

  setPhase(phase: TwitchPhase): void {
    if (phase === this.phase) return
    log(`[twitch] fase ${this.phase} → ${phase} (${TWITCH_PHASES[phase].label})`)
    this.phase = phase
    this.phaseStartedAt = phase === 'off' ? undefined : Date.now()
    this.gainedPhase = 0
    this.chestsPhase = 0
    for (const s of this.status.values()) s.chests = 0
    for (const login of [...this.watchers.keys()]) this.stopWatcher(login, 'mudança de fase')
    this.reconcile()
    this.deps.onChange()
    void this.poll()
  }

  /** Fase R: o chat popout, onde fica o resgate. Enquanto aberto, grava os pedidos de pontos (sem tokens). */
  openStore(login: string): void {
    const win = new BrowserWindow({
      width: 440,
      height: 760,
      title: `Twitch — pontos de ${login} (gravando)`,
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION },
    })
    applyPolicy(win.webContents)
    this.recordPoints(win, login)
    void win.loadURL(`${TWITCH}/popout/${login}/chat`)
    log(`[twitch] loja de ${login} aberta (gravando em s8-twitch-net.jsonl)`)
  }

  onResume(): void {
    for (const login of [...this.watchers.keys()]) this.stopWatcher(login, 'o PC voltou da suspensão')
    setTimeout(() => this.reconcile(), 15_000)
  }

  dispose(): void {
    for (const login of [...this.watchers.keys()]) this.stopWatcher(login, 'saindo')
  }

  private async refreshLogin(): Promise<void> {
    const cookies = await this.ses.cookies.get({ url: TWITCH, name: 'auth-token' })
    this.loggedIn = cookies.length > 0
  }

  private reconcile(): void {
    const { lives, window } = TWITCH_PHASES[this.phase]
    const wanted = this.loggedIn || ANON ? pickWatched(this.officials(), [...this.watchers.keys()], lives) : []
    for (const login of [...this.watchers.keys()]) if (!wanted.includes(login)) this.stopWatcher(login, 'a live acabou')
    for (const login of wanted) {
      if (this.watchers.has(login)) continue
      const watcher: LiveWatcher = new LiveWatcher({
        label: `twitch · ${login}`,
        url: `${TWITCH}/${login}`,
        partition: PARTITION,
        size: WATCHER_SIZE,
        window,
        applyPolicy,
        onGone: () => {
          if (this.watchers.get(login) === watcher) this.stopWatcher(login, 'a página não está mais disponível')
        },
        onWsFrame: (data) => this.onFrame(login, data),
      })
      this.watcherIds.add(watcher.webContentsId)
      this.watchers.set(login, watcher)
      log(`[twitch] abrindo ${login} (janela ${window === 'hidden' ? 'escondida' : 'transparente'})`)
    }
  }

  private stopWatcher(login: string, why: string): void {
    const w = this.watchers.get(login)
    if (!w) return
    this.watchers.delete(login)
    this.watcherIds.delete(w.webContentsId)
    log(`[twitch] fechando ${login} após ${Math.round((Date.now() - w.since) / 60_000)} min: ${why}`)
    w.close()
  }

  private onFrame(login: string, data: string): void {
    if (!POINTS_RE.test(data)) return
    const gain = parsePointsGain(data)
    if (gain) {
      // a mesma mensagem chega a todas as páginas abertas
      if (this.seenGains.has(gain.key)) return
      this.seenGains.add(gain.key)
      this.gainedPhase += gain.points
      log(`[twitch] +${gain.points} pontos (${gain.reason}, canal ${gain.channelId})`)
    }
    spikeJsonl('s8-twitch-net', { page: login, kind: 'ws', data: redactSecrets(data).slice(0, 4000) })
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      await this.refreshLogin()
      this.reconcile()
      const { chest } = TWITCH_PHASES[this.phase]
      for (const [login, w] of this.watchers) {
        const s = this.status.get(login) ?? { chests: 0 }
        this.status.set(login, s)
        const info = await w.evaluate<PageInfo>(pageScript(chest))
        if (!info) {
          s.video = 'sem resposta'
          continue
        }
        s.video = info.video
        if (info.balance !== null) s.balance = info.balance
        if (info.gateClicked) log(`[twitch] ${login}: aviso de conteúdo confirmado`)
        if (info.chestClicked) {
          s.chests++
          this.chestsPhase++
          log(`[twitch] ${login}: baú clicado`)
        }
        if (info.pointsHtml && !s.domSaved) {
          s.domSaved = true
          spikeJsonl('s8-twitch-dom', { login, html: redactSecrets(info.pointsHtml) })
        }
      }
      this.polledAt = Date.now()
      this.writeCsv()
    } finally {
      this.polling = false
      this.deps.onChange()
    }
  }

  private writeCsv(): void {
    if (this.phase === 'off') return
    const time = new Date().toISOString()
    const metrics = new Map(app.getAppMetrics().map((m) => [m.pid, m.memory]))
    const fmt = (n: number | undefined) => (n === undefined ? '' : (n / 1024).toFixed(1))
    const rows = this.state()
      .channels.filter((c) => c.watching || c.balance !== undefined)
      .map((c) => {
        const pid = this.watchers.get(c.login)?.pid()
        const mem = pid ? metrics.get(pid) : undefined
        const clean = (text: string | undefined) => (text ?? '').replaceAll(',', '.')
        return [time, this.phase, c.login, c.live, c.watching, clean(c.balance), c.chests, clean(c.video), fmt(mem?.workingSetSize), fmt(mem?.privateBytes), this.gainedPhase].join(',')
      })
    spikeCsv('s8-twitch', CSV_HEADER, rows)
  }

  /** Grava só o que é de pontos: nome da operação e corpo do pedido, resposta e mensagens, sem tokens. */
  private recordPoints(win: BrowserWindow, login: string): void {
    const dbg = win.webContents.debugger
    try {
      dbg.attach('1.3')
    } catch {
      return
    }
    const tracked = new Set<string>()
    dbg.on('message', (_e, method, params) => {
      const p = params as Record<string, unknown>
      if (method === 'Network.requestWillBeSent') {
        const req = p['request'] as { method: string; url: string; postData?: string }
        if (!req.url.includes('gql.twitch.tv') || !POINTS_RE.test(req.postData ?? '')) return
        tracked.add(p['requestId'] as string)
        spikeJsonl('s8-twitch-net', { page: login, kind: 'request', body: redactSecrets(req.postData ?? '').slice(0, 4000) })
      } else if (method === 'Network.loadingFinished') {
        const id = p['requestId'] as string
        if (!tracked.delete(id)) return
        dbg
          .sendCommand('Network.getResponseBody', { requestId: id })
          .then((r: { body: string }) => spikeJsonl('s8-twitch-net', { page: login, kind: 'response', body: redactSecrets(r.body).slice(0, 8000) }))
          .catch(() => {})
      } else if (method === 'Network.webSocketFrameReceived') {
        this.onFrame(login, (p['response'] as { payloadData: string }).payloadData)
      }
    })
    void dbg.sendCommand('Network.enable').catch(() => {})
  }
}
