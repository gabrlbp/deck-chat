import { app, BrowserWindow, Notification } from 'electron'
import type { GameEventKind } from '../../shared/ipc'
import type { KickChannelView, KickReward, KickState } from '../../shared/kick'
import { BONUS_TYPES, type BonusType, type KickConfig, type SlotId } from '../../shared/schemas'
import { log } from '../logger'
import { LiveWatcher } from '../live/LiveWatcher'
import { applyKickPolicy, KICK, KICK_PARTITION, KickSession } from './KickSession'
import { canRedeem, CONFIRM_TIMEOUT_MS, pickChannel, pickTarget, ulid } from './redeem'
import { planLives } from './select'

const POLL_MS = 60_000
const FIRST_POLL_MS = 15_000
/** os canais fechados só mudam de saldo se você assistir em outro lugar: consulta bem menos */
const CLOSED_CHANNEL_EVERY_POLLS = 10
/** sem ganhar nada nesse tempo, a live cede a vaga. Medido no S6: +10 a cada ~6 min */
const IDLE_MS = 15 * 60_000
const COOLDOWN_MS = 30 * 60_000
/** a página acumula memória com as horas; renova a live */
const RECYCLE_MS = 6 * 60 * 60_000
/** canal cujo resgate falhou (ex.: recompensa pausada) fica um tempo sem tentar */
const CHANNEL_FAIL_COOLDOWN_MS = 30 * 60_000
const WATCHER_SIZE = { width: 480, height: 270 }
const BONUS_NAME: Record<BonusType, string> = { xp: 'XP', captura: 'Captura', shiny: 'Shiny' }

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

/** desenvolvimento: abre lives sem login (não ganha pontos), para testar sem a conta */
const ANON = !app.isPackaged && process.env['DECK_LIVE_ANON'] === '1'

export type GameKick = {
  slot: SlotId
  vinculado?: boolean
  login?: string | null
  bonus?: Record<string, number>
  recompensas?: { tipo: string; titulo?: string; custo: number }[]
  oficiais?: { slug: string; nome?: string; aoVivo?: boolean; espectadores?: number; ativo?: boolean }[]
}

type ChannelStatus = {
  points: number | null
  gained: number
  lastGainAt?: number
  coolingUntil?: number
  redeemFailedAt?: number
  /** a API disse que a live acabou; o jogo pode demorar a atualizar */
  apiOffline?: boolean
  video?: string
  /** para o aviso de "já dá para resgatar": a faixa de bônus que o saldo alcançou */
  tier?: number
}

type Deps = {
  /** bloco `kick` de cada slot que já recebeu */
  blocks: () => GameKick[]
  config: () => KickConfig
  setConfig: (patch: Partial<KickConfig>) => void
  onChange: () => void
  onEvent: (kind: GameEventKind, title: string, detail: string | undefined, slot: SlotId | undefined) => void
}

type PendingRedeem = { tipo: BonusType; slug: string; before: number; at: number }

/**
 * Farm de pontos da Kick na conta principal: mantém as lives abertas e, conforme a opção, avisa ou resgata.
 * A lista de canais e os bônus vêm do próprio jogo (`estado.kick`).
 */
export class KickFarm {
  private readonly session: KickSession
  private readonly deps: Deps
  private readonly watchers = new Map<string, LiveWatcher>()
  private readonly status = new Map<string, ChannelStatus>()
  private readonly watcherIds = new Set<number>()
  private readonly notifications = new Set<Notification>()
  private loggedIn: boolean | null = null
  private polledAt?: number
  private problem?: string
  private polling = false
  private pollCount = 0
  private pending: PendingRedeem | null = null
  private redeemHistory: number[] = []
  private redeemBlocked?: string

  constructor(deps: Deps) {
    this.deps = deps
    this.session = new KickSession(() => {
      void this.refreshLogin().then(() => {
        this.reconcile()
        this.deps.onChange()
      })
    })
    this.session.ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
      const hidden = details.webContentsId !== undefined && this.watcherIds.has(details.webContentsId)
      cb({
        cancel:
          BLOCKED_HOSTS.some((h) => details.url.includes(h)) ||
          // ninguém olha para as lives escondidas: sem imagens nem fontes
          (hidden && (details.resourceType === 'image' || details.resourceType === 'font')),
      })
    })
  }

  start(): void {
    void this.refreshLogin().then(() => this.deps.onChange())
    setTimeout(() => {
      void this.poll()
      setInterval(() => void this.poll(), POLL_MS)
    }, FIRST_POLL_MS)
  }

  private linkedBlock(): GameKick | undefined {
    return this.deps.blocks().find((b) => b.vinculado)
  }

  private officials(): NonNullable<GameKick['oficiais']> {
    const blocks = this.deps.blocks()
    const best = this.linkedBlock()?.oficiais ?? blocks.find((b) => b.oficiais)?.oficiais ?? []
    return best.filter((o) => o.ativo !== false)
  }

  private rewards(): KickReward[] {
    const blocks = this.deps.blocks()
    const list = this.linkedBlock()?.recompensas ?? blocks.find((b) => b.recompensas)?.recompensas ?? []
    return list.flatMap((r) =>
      (BONUS_TYPES as readonly string[]).includes(r.tipo)
        ? [{ tipo: r.tipo as BonusType, titulo: r.titulo ?? '', custo: r.custo }]
        : [],
    )
  }

  private target(now: number): BonusType | null {
    const linked = this.linkedBlock()
    return linked ? pickTarget(this.deps.config(), linked.bonus ?? {}, now) : null
  }

  state(): KickState {
    const now = Date.now()
    const memory = this.memoryByPid()
    const officials = this.officials()
    const known = new Map(officials.map((o) => [o.slug, o]))
    const slugs = [...officials.map((o) => o.slug), ...[...this.watchers.keys()].filter((s) => !known.has(s))]
    const channels: KickChannelView[] = slugs.map((slug) => {
      const o = known.get(slug)
      const s = this.status.get(slug)
      const w = this.watchers.get(slug)
      const pid = w?.pid()
      return {
        slug,
        nome: o?.nome ?? slug,
        live: o?.aoVivo === true && s?.apiOffline !== true,
        viewers: o?.espectadores,
        watching: w !== undefined,
        points: s?.points ?? null,
        gained: s?.gained ?? 0,
        watchingSince: w?.since,
        coolingUntil: s?.coolingUntil !== undefined && s.coolingUntil > now ? s.coolingUntil : undefined,
        video: w ? s?.video : undefined,
        memoryMb: pid ? memory.get(pid) : undefined,
      }
    })
    const linked = this.linkedBlock()
    return {
      login: this.loggedIn === null ? 'unknown' : this.loggedIn ? 'logged-in' : 'logged-out',
      loggingIn: this.session.loggingIn,
      config: this.deps.config(),
      linked: linked ? { slot: linked.slot, login: linked.login ?? null } : null,
      bonus: linked?.bonus ?? {},
      rewards: this.rewards(),
      target: this.target(now),
      channels,
      gainedTotal: [...this.status.values()].reduce((sum, s) => sum + s.gained, 0),
      polledAt: this.polledAt,
      problem: this.problem,
      redeemBlocked: this.redeemBlocked,
    }
  }

  /** pid → nome, para a tabela de memória em Sobre */
  processLabels(): Map<number, string> {
    const labels = new Map<number, string>()
    const api = this.session.apiPid()
    if (api) labels.set(api, 'kick · consultas')
    for (const [slug, w] of this.watchers) {
      const pid = w.pid()
      if (pid) labels.set(pid, `kick · ${slug}`)
    }
    return labels
  }

  login(): void {
    this.session.openLogin()
  }

  async logout(): Promise<void> {
    for (const slug of [...this.watchers.keys()]) this.stopWatcher(slug, 'saiu da conta')
    await this.session.logout()
    this.status.clear()
    this.pending = null
    this.deps.onChange()
  }

  setConfig(patch: Partial<KickConfig>): void {
    this.deps.setConfig(patch)
    // quem mexe na opção de resgate já viu o aviso: libera de novo
    if (patch.redeem !== undefined || patch.redeemType !== undefined) this.redeemBlocked = undefined
    log(`[kick] opções: ${JSON.stringify(this.deps.config())}`)
    this.reconcile()
    this.deps.onChange()
  }

  /** O chat popout da Kick, onde ficam as recompensas do canal. Para resgatar à mão. */
  openStore(slug: string): void {
    const win = new BrowserWindow({
      width: 440,
      height: 760,
      title: `Kick — pontos de ${slug}`,
      autoHideMenuBar: true,
      webPreferences: { partition: KICK_PARTITION },
    })
    applyKickPolicy(win.webContents)
    void win.loadURL(`${KICK}/popout/${slug}/chat`)
    win.on('closed', () => void this.poll())
  }

  /** Depois de suspender, as lives abertas não voltam sozinhas: reabre. */
  onResume(): void {
    for (const slug of [...this.watchers.keys()]) this.stopWatcher(slug, 'o PC voltou da suspensão')
    setTimeout(() => void this.poll(), 15_000)
  }

  dispose(): void {
    for (const slug of [...this.watchers.keys()]) this.stopWatcher(slug, 'saindo')
    this.session.dispose()
  }

  private async refreshLogin(): Promise<void> {
    this.loggedIn = await this.session.isLoggedIn()
  }

  private reconcile(now = Date.now()): void {
    const canFarm = this.loggedIn === true || ANON
    const lives = canFarm ? this.deps.config().lives : 0

    for (const [slug, w] of [...this.watchers]) {
      const s = this.status.get(slug)
      if (now - w.since >= RECYCLE_MS) {
        this.stopWatcher(slug, 'renovando para liberar memória')
      } else if (this.loggedIn && now - Math.max(w.since, s?.lastGainAt ?? 0) >= IDLE_MS) {
        // ex.: outra live aberta no celular está usando as vagas
        if (s) s.coolingUntil = now + COOLDOWN_MS
        this.stopWatcher(slug, `${IDLE_MS / 60_000} min sem ganhar pontos, cedendo a vaga`)
      }
    }

    const target = this.target(now)
    const cost = target ? (this.rewards().find((r) => r.tipo === target)?.custo ?? null) : null
    const wanted = planLives(
      this.officials().map((o) => {
        const s = this.status.get(o.slug)
        return {
          slug: o.slug,
          live: o.aoVivo === true && s?.apiOffline !== true,
          points: s?.points ?? null,
          cooling: (s?.coolingUntil ?? 0) > now,
        }
      }),
      [...this.watchers.keys()],
      lives,
      cost,
    )
    for (const slug of [...this.watchers.keys()]) if (!wanted.includes(slug)) this.stopWatcher(slug, 'trocando de canal')
    for (const slug of wanted) if (!this.watchers.has(slug)) this.startWatcher(slug)
  }

  private startWatcher(slug: string): void {
    const label = `kick · ${slug}`
    const watcher: LiveWatcher = new LiveWatcher({
      label,
      url: `${KICK}/${slug}`,
      partition: KICK_PARTITION,
      size: WATCHER_SIZE,
      applyPolicy: applyKickPolicy,
      onGone: () => {
        if (this.watchers.get(slug) === watcher) this.stopWatcher(slug, 'a página não está mais disponível')
      },
    })
    this.watcherIds.add(watcher.webContentsId)
    this.watchers.set(slug, watcher)
    const s = this.status.get(slug)
    log(`[kick] abrindo ${slug} (saldo ${s?.points ?? '?'})`)
  }

  private stopWatcher(slug: string, why: string): void {
    const w = this.watchers.get(slug)
    if (!w) return
    this.watchers.delete(slug)
    this.watcherIds.delete(w.webContentsId)
    log(`[kick] fechando ${slug} após ${Math.round((Date.now() - w.since) / 60_000)} min: ${why}`)
    w.close()
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    const now = Date.now()
    try {
      await this.refreshLogin()
      if (!this.loggedIn && !ANON) {
        this.problem = undefined
        this.reconcile(now)
        return
      }
      await this.readBalances(now)
      if (this.loggedIn) await this.handleRewards(now)
      this.reconcile(now)
      for (const [slug, w] of this.watchers) {
        const s = this.status.get(slug)
        if (s) s.video = await w.probeVideo()
      }
      this.polledAt = now
    } finally {
      this.polling = false
      this.deps.onChange()
    }
  }

  private async readBalances(now: number): Promise<void> {
    const all = this.pollCount++ % CLOSED_CHANNEL_EVERY_POLLS === 0
    const slugs = this.officials()
      .map((o) => o.slug)
      .filter((slug) => all || this.watchers.has(slug) || this.status.get(slug)?.points === undefined)
    let failures = 0
    for (const slug of slugs) {
      const s = this.status.get(slug) ?? { points: null, gained: 0 }
      this.status.set(slug, s)
      try {
        const { status, json } = await this.session.fetch(`/api/v2/channels/${slug}/points`)
        const data = json as { data?: { points?: unknown }; points?: unknown } | null
        const p = data?.data?.points ?? data?.points
        if (status === 200 && typeof p === 'number') {
          if (s.points !== null && p > s.points) {
            s.gained += p - s.points
            s.lastGainAt = now
          }
          s.points = p
        } else {
          failures++
        }
        if (this.watchers.has(slug)) {
          const channel = await this.session.fetch(`/api/v2/channels/${slug}`)
          if (channel.status === 200) s.apiOffline = !(channel.json as { livestream?: unknown } | null)?.livestream
        } else {
          // só vale enquanto a live está aberta: o jogo volta a mandar quem está ao vivo
          s.apiOffline = undefined
        }
      } catch (err) {
        failures++
        log(`[kick] falha ao ler ${slug}: ${String(err instanceof Error ? err.message : err)}`)
      }
    }
    this.problem =
      this.loggedIn && slugs.length > 0 && failures === slugs.length
        ? 'nenhum canal respondeu (Kick fora do ar ou sessão expirada?)'
        : undefined
  }

  private async handleRewards(now: number): Promise<void> {
    const config = this.deps.config()
    if (config.redeem === 'none') {
      this.notifyReachable()
      return
    }
    const linked = this.linkedBlock()
    // sem o vínculo no jogo os pontos voltariam; e sem o bloco não dá para conferir se creditou
    if (!linked) return

    if (this.pending) {
      const { tipo, slug, before, at } = this.pending
      const current = linked.bonus?.[tipo] ?? 0
      if (current > before) {
        const until = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(current)
        log(`[kick] resgate confirmado no jogo: ${tipo} em ${slug}, até ${until}`)
        this.deps.onEvent('bonus', `Kick: bônus de ${BONUS_NAME[tipo]} resgatado`, `canal ${slug}, valendo até ${until}`, linked.slot)
        this.pending = null
      } else if (now - at > CONFIRM_TIMEOUT_MS) {
        this.pending = null
        this.blockRedeem(`o jogo não creditou o resgate de ${BONUS_NAME[tipo]} em ${slug}. Confira o vínculo da Kick no jogo.`, linked.slot)
      }
      if (this.pending) return
    }
    if (this.redeemBlocked || !canRedeem(this.redeemHistory, now)) return

    const tipo = pickTarget(config, linked.bonus ?? {}, now)
    const reward = this.rewards().find((r) => r.tipo === tipo)
    if (!tipo || !reward) return
    const balances = this.officials()
      .map((o) => ({ slug: o.slug, s: this.status.get(o.slug) }))
      .filter(({ s }) => s !== undefined && now - (s.redeemFailedAt ?? 0) > CHANNEL_FAIL_COOLDOWN_MS)
      .map(({ slug, s }) => ({ slug, points: s?.points ?? null }))
    const slug = pickChannel(balances, reward.custo)
    if (slug) await this.redeem(slug, tipo, reward, linked, now)
  }

  private async redeem(slug: string, tipo: BonusType, reward: KickReward, linked: GameKick, now: number): Promise<void> {
    const status = this.status.get(slug)
    const fail = (why: string) => {
      log(`[kick] resgate de ${tipo} em ${slug} falhou: ${why}`)
      if (status) status.redeemFailedAt = now
    }
    try {
      const list = await this.session.fetch(`/api/v2/channels/${slug}/rewards?is_enabled=true`)
      const rewards = (list.json as { data?: { id: string; title: string; cost: number; is_paused?: boolean }[] } | null)?.data ?? []
      // pelo título que o próprio jogo informa: os pacotes de 3, 5 e 10 h têm outros títulos
      const found = rewards.find((r) => r.title === reward.titulo)
      if (list.status !== 200 || !found) return fail(`recompensa "${reward.titulo}" não encontrada no canal (HTTP ${list.status})`)
      if (found.is_paused) return fail('recompensa pausada pelo canal')
      if ((status?.points ?? 0) < found.cost) return fail(`saldo menor que o custo no canal (${found.cost})`)

      log(`[kick] resgatando ${tipo} em ${slug} (${found.cost} de ${status?.points ?? '?'} pontos)`)
      this.redeemHistory.push(now)
      const res = await this.session.fetch(`/api/v2/channels/${slug}/rewards/${found.id}/redeem`, {
        transaction_id: ulid(now),
      })
      if (res.status !== 201 && res.status !== 200) return fail(`HTTP ${res.status}`)
      if (status && status.points !== null) status.points -= found.cost
      this.pending = { tipo, slug, before: linked.bonus?.[tipo] ?? 0, at: now }
    } catch (err) {
      fail(String(err instanceof Error ? err.message : err))
    }
  }

  private blockRedeem(reason: string, slot: SlotId | undefined): void {
    this.redeemBlocked = reason
    log(`[kick] resgate automático parado: ${reason}`)
    this.deps.onEvent('problem', 'Kick: resgate automático parado', reason, slot)
    this.popup('Resgate automático parado', reason)
  }

  /** Modo "só avisar": quando o saldo de um canal alcança um bônus. O saldo ao abrir o app é a referência. */
  private notifyReachable(): void {
    const rewards = [...this.rewards()].sort((a, b) => a.custo - b.custo)
    const slot = this.linkedBlock()?.slot
    for (const [slug, s] of this.status) {
      if (s.points === null) continue
      const tier = rewards.filter((r) => (s.points ?? 0) >= r.custo).length
      const best = rewards[tier - 1]
      if (s.tier !== undefined && tier > s.tier && best) {
        const title = `Kick · ${slug}: ${s.points} pontos`
        const detail = `já dá para resgatar ${BONUS_NAME[best.tipo]}`
        this.deps.onEvent('bonus', title, detail, slot)
        this.popup(title, `${detail}. Clique para abrir a loja.`, () => this.openStore(slug))
      }
      s.tier = tier
    }
  }

  private popup(title: string, body: string, onClick?: () => void): void {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body })
    // sem referência, o Windows perde o clique na notificação
    this.notifications.add(n)
    n.on('click', () => {
      this.notifications.delete(n)
      onClick?.()
    })
    n.on('close', () => this.notifications.delete(n))
    n.show()
  }

  private memoryByPid(): Map<number, number> {
    const map = new Map<number, number>()
    for (const m of app.getAppMetrics()) map.set(m.pid, (m.memory.privateBytes ?? m.memory.workingSetSize) / 1024)
    return map
  }
}

