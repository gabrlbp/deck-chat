import { shell } from 'electron'
import type { ChannelView, TwitchAuth, TwitchState } from '../../shared/ipc'
import type { Config } from '../../shared/schemas'
import type { GameSnapshot } from '../game/GameState'
import { log } from '../logger'
import { pollDeviceToken, refreshTokens, requestDeviceCode, revokeToken, validateToken } from './auth'
import { LiveTracker, bonusAt, mergeChannels } from './channels'
import { deleteTokens, loadTokens, saveTokens, type StoredTokens } from './tokenStore'
import { TwitchPresence } from './TwitchPresence'

const VALIDATE_EVERY_MS = 60 * 60_000
/** Renova antes de expirar, para o IRC nunca usar um token vencido. */
const REFRESH_BEFORE_MS = 20 * 60_000

export class TwitchService {
  private readonly config: Config
  private readonly persist: () => void
  private readonly onChange: () => void
  private readonly presence: TwitchPresence
  private readonly live = new LiveTracker()
  private tokens: StoredTokens | null = null
  private auth: TwitchAuth = { state: 'disconnected' }
  private pendingLogin: AbortController | null = null
  private validateTimer: NodeJS.Timeout | null = null

  constructor(config: Config, persist: () => void, onChange: () => void) {
    this.config = config
    this.persist = persist
    this.onChange = onChange
    this.presence = new TwitchPresence({
      getCredentials: () => (this.tokens ? { login: this.tokens.login, accessToken: this.tokens.accessToken } : null),
      onAuthFailed: () => this.renew('o chat recusou o token'),
      onChange,
    })
  }

  async start(): Promise<void> {
    this.tokens = loadTokens()
    if (!this.tokens) return
    if (await this.ensureValid()) this.connect()
    this.validateTimer = setInterval(() => {
      void this.ensureValid()
    }, VALIDATE_EVERY_MS)
  }

  state(): TwitchState {
    const channels: ChannelView[] = this.entries().map((entry) => {
      const live = this.live.get(entry.login)
      const joinedAt = this.presence.joinedAt(entry.login)
      return {
        ...entry,
        live: live.live,
        viewers: live.viewers,
        present: joinedAt !== undefined,
        bonusAt: live.live ? bonusAt(joinedAt, live.since) : undefined,
      }
    })
    return { auth: this.auth, connection: this.presence.connection(), channels }
  }

  /** Lista oficial e "ao vivo" vêm do jogo (S4): qualquer slot logado serve. */
  syncFromGame(snapshots: Readonly<GameSnapshot>[], now = Date.now()): void {
    const withList = snapshots.find((s) => s.twitchOficiais?.length)
    if (withList?.twitchOficiais) {
      const official = withList.twitchOficiais.map((c) => ({ login: c.login.toLowerCase(), nome: c.nome ?? c.login }))
      if (JSON.stringify(official) !== JSON.stringify(this.config.twitch.official)) {
        log(`[twitch] lista oficial do jogo: ${official.map((c) => c.login).join(', ')}`)
        this.config.twitch.official = official
        this.persist()
        this.applyChannels()
      }
    }
    const withLives = snapshots.find((s) => s.twitchLives !== undefined)
    if (withLives?.twitchLives) this.live.update(withLives.twitchLives, now)
  }

  async login(): Promise<void> {
    this.cancelLogin()
    const abort = new AbortController()
    this.pendingLogin = abort
    try {
      const code = await requestDeviceCode()
      this.setAuth({ state: 'pending', userCode: code.userCode, verificationUri: code.verificationUri, expiresAt: code.expiresAt })
      // navegador padrão, onde a main já está logada: nunca numa janela do app (login novo derruba sessões)
      void shell.openExternal(code.verificationUri)
      const tokens = await pollDeviceToken(code, abort.signal)
      const info = await validateToken(tokens.accessToken)
      if (!info) throw new Error('token recém-criado não passou na validação')
      this.tokens = { login: info.login, ...tokens }
      saveTokens(this.tokens)
      log(`[twitch] conectado como ${info.login}`)
      this.connect()
    } catch (err) {
      if (abort.signal.aborted) return
      log(`[twitch] login falhou: ${String(err)}`)
      this.setAuth({ state: 'reauth', reason: err instanceof Error ? err.message : String(err) })
    } finally {
      if (this.pendingLogin === abort) this.pendingLogin = null
    }
  }

  cancelLogin(): void {
    if (!this.pendingLogin) return
    this.pendingLogin.abort()
    this.pendingLogin = null
    this.setAuth(this.tokens ? { state: 'connected', login: this.tokens.login } : { state: 'disconnected' })
  }

  openActivate(): void {
    if (this.auth.state === 'pending') void shell.openExternal(this.auth.verificationUri)
  }

  async logout(): Promise<void> {
    this.presence.stop()
    if (this.tokens) await revokeToken(this.tokens.accessToken)
    this.tokens = null
    deleteTokens()
    log('[twitch] desconectado')
    this.setAuth({ state: 'disconnected' })
  }

  setChannelEnabled(login: string, enabled: boolean): void {
    const disabled = new Set(this.config.twitch.disabled)
    if (enabled) disabled.delete(login)
    else disabled.add(login)
    this.config.twitch.disabled = [...disabled]
    this.persist()
    this.applyChannels()
  }

  addExtra(login: string): void {
    if (this.config.twitch.extras.includes(login)) return
    this.config.twitch.extras.push(login)
    this.config.twitch.disabled = this.config.twitch.disabled.filter((c) => c !== login)
    this.persist()
    this.applyChannels()
  }

  removeExtra(login: string): void {
    this.config.twitch.extras = this.config.twitch.extras.filter((c) => c !== login)
    this.config.twitch.disabled = this.config.twitch.disabled.filter((c) => c !== login)
    this.persist()
    this.applyChannels()
  }

  /** O PC voltou da suspensão: a conexão quase certamente morreu. */
  onResume(): void {
    void this.ensureValid().then((ok) => ok && this.presence.reconnectNow('PC voltou da suspensão'))
  }

  dispose(): void {
    if (this.validateTimer) clearInterval(this.validateTimer)
    this.pendingLogin?.abort()
    this.presence.stop()
  }

  private entries() {
    const t = this.config.twitch
    return mergeChannels(t.official, t.extras, t.disabled)
  }

  private applyChannels(): void {
    this.presence.setChannels(this.entries().filter((c) => c.enabled).map((c) => c.login))
    this.onChange()
  }

  private connect(): void {
    if (!this.tokens) return
    this.setAuth({ state: 'connected', login: this.tokens.login })
    this.applyChannels()
    this.presence.start()
  }

  /** Valida o token e renova se estiver vencido ou perto de vencer. */
  private async ensureValid(): Promise<boolean> {
    if (!this.tokens) return false
    try {
      const info = await validateToken(this.tokens.accessToken)
      if (info && info.expiresInMs > REFRESH_BEFORE_MS) return true
      return await this.renew(info ? 'token perto de vencer' : 'token vencido')
    } catch (err) {
      // sem internet: mantém o token e tenta de novo na próxima validação
      log(`[twitch] não foi possível validar o token: ${String(err)}`)
      return true
    }
  }

  private async renew(reason: string): Promise<boolean> {
    if (!this.tokens) return false
    log(`[twitch] renovando token (${reason})`)
    const renewed = await refreshTokens(this.tokens.refreshToken).catch(() => null)
    if (!renewed) {
      log('[twitch] renovação falhou, é preciso conectar de novo')
      this.presence.stop()
      this.setAuth({ state: 'reauth', reason: 'A Twitch não aceitou mais o acesso salvo. Conecte de novo.' })
      return false
    }
    this.tokens = { ...this.tokens, ...renewed }
    saveTokens(this.tokens)
    return true
  }

  private setAuth(auth: TwitchAuth): void {
    this.auth = auth
    this.onChange()
  }
}
