import type { TwitchConnection } from '../../shared/ipc'
import { log } from '../logger'
import { channelOf, nickOf, parseIrc, type IrcMessage } from './irc'

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443'
/** O bônus some em < 5 min fora do chat (S1): quedas precisam ser detectadas em segundos. */
const KEEPALIVE_MS = 60_000
const PONG_TIMEOUT_MS = 10_000
const BACKOFF_MAX_MS = 60_000
/** Rate limit de JOIN da Twitch: 20 a cada 10 s. */
const JOIN_BATCH = 20
const JOIN_BATCH_DELAY_MS = 11_000
/** Reconexão rápida não "reinicia" o bônus: a Twitch nem percebe uma ausência tão curta. */
const KEEP_JOIN_TIME_MS = 60_000

type Credentials = { login: string; accessToken: string }

type Options = {
  getCredentials: () => Credentials | null
  /** token recusado: tenta renovar; `false` = precisa logar de novo */
  onAuthFailed: () => Promise<boolean>
  onChange: () => void
}

/** Presença "invisível" da main nos chats: uma conexão IRC, JOIN em todos os canais, nada mais. */
export class TwitchPresence {
  private readonly opts: Options
  private ws: WebSocket | null = null
  private status: TwitchConnection = 'offline'
  private running = false
  private wanted = new Set<string>()
  private joined = new Map<string, number>()
  private lastJoinedAt = new Map<string, number>()
  private droppedAt = 0
  private backoff = 1000
  private reconnectTimer: NodeJS.Timeout | null = null
  private keepaliveTimer: NodeJS.Timeout | null = null
  private pongTimer: NodeJS.Timeout | null = null

  constructor(opts: Options) {
    this.opts = opts
  }

  connection(): TwitchConnection {
    return this.status
  }

  joinedAt(login: string): number | undefined {
    return this.joined.get(login)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.open()
  }

  stop(): void {
    this.running = false
    this.clearTimers()
    this.ws?.close()
    this.ws = null
    this.joined.clear()
    this.setStatus('offline')
  }

  /** Ex.: o PC voltou da suspensão. */
  reconnectNow(reason: string): void {
    if (!this.running) return
    log(`[twitch] reconectando agora: ${reason}`)
    this.backoff = 1000
    this.ws?.close()
  }

  /** Conjunto desejado de canais; entra e sai conforme a diferença. */
  setChannels(logins: string[]): void {
    const next = new Set(logins)
    const toJoin = [...next].filter((c) => !this.wanted.has(c))
    const toPart = [...this.wanted].filter((c) => !next.has(c))
    this.wanted = next
    if (this.status !== 'connected') return
    if (toPart.length) this.send(`PART ${toPart.map((c) => `#${c}`).join(',')}`)
    for (const c of toPart) this.joined.delete(c)
    void this.join(toJoin)
    if (toPart.length) this.opts.onChange()
  }

  private open(): void {
    const creds = this.opts.getCredentials()
    if (!creds) {
      this.setStatus('offline')
      return
    }
    this.setStatus('connecting')
    const ws = new WebSocket(IRC_URL)
    this.ws = ws

    ws.addEventListener('open', () => {
      ws.send('CAP REQ :twitch.tv/commands')
      ws.send(`PASS oauth:${creds.accessToken}`)
      ws.send(`NICK ${creds.login}`)
    })
    ws.addEventListener('message', (event) => {
      for (const line of String(event.data).split('\r\n')) if (line) this.handle(parseIrc(line), creds.login)
    })
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      this.onDrop()
    })
    ws.addEventListener('error', () => {
      // o evento close vem logo depois e trata a reconexão
    })
  }

  private handle(msg: IrcMessage, login: string): void {
    switch (msg.command) {
      case 'PING':
        this.send(`PONG :${msg.params.at(-1) ?? 'tmi.twitch.tv'}`)
        break
      case 'PONG':
        if (this.pongTimer) clearTimeout(this.pongTimer)
        this.pongTimer = null
        break
      case '001':
        log(`[twitch] conectado ao chat como ${login}`)
        this.backoff = 1000
        this.setStatus('connected')
        this.startKeepalive()
        void this.join([...this.wanted])
        break
      case 'JOIN': {
        const channel = channelOf(msg)
        if (nickOf(msg) !== login || !channel) break
        const previous = this.lastJoinedAt.get(channel)
        const quickReturn = previous !== undefined && Date.now() - this.droppedAt < KEEP_JOIN_TIME_MS
        const at = quickReturn ? previous : Date.now()
        this.joined.set(channel, at)
        this.lastJoinedAt.set(channel, at)
        this.opts.onChange()
        break
      }
      case 'PART': {
        const channel = channelOf(msg)
        if (nickOf(msg) === login && channel && this.joined.delete(channel)) this.opts.onChange()
        break
      }
      case 'NOTICE': {
        const text = msg.params.at(-1) ?? ''
        log(`[twitch] NOTICE ${msg.params[0] ?? ''}: ${text}`)
        if (/authentication failed|improperly formatted auth/i.test(text)) void this.onAuthRejected()
        break
      }
      case 'RECONNECT':
        log('[twitch] servidor pediu RECONNECT')
        this.ws?.close()
        break
    }
  }

  private async onAuthRejected(): Promise<void> {
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.clearTimers()
    this.joined.clear()
    const ok = await this.opts.onAuthFailed()
    if (ok && this.running) this.open()
    else this.stop()
  }

  private onDrop(): void {
    this.clearTimers()
    if (this.joined.size) this.droppedAt = Date.now()
    this.joined.clear()
    if (!this.running) return
    this.setStatus('connecting')
    log(`[twitch] conexão caiu, tentando de novo em ${this.backoff / 1000}s`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, this.backoff)
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
  }

  private async join(channels: string[]): Promise<void> {
    for (let i = 0; i < channels.length; i += JOIN_BATCH) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, JOIN_BATCH_DELAY_MS))
      if (this.status !== 'connected') return
      const batch = channels.slice(i, i + JOIN_BATCH).filter((c) => this.wanted.has(c))
      if (batch.length) this.send(`JOIN ${batch.map((c) => `#${c}`).join(',')}`)
    }
  }

  /** PING próprio: o da Twitch vem a cada ~5 min, tarde demais para não perder o bônus. */
  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      this.send('PING :deck-chat')
      this.pongTimer = setTimeout(() => {
        log('[twitch] sem PONG em 10s, reconectando')
        this.ws?.close()
      }, PONG_TIMEOUT_MS)
    }, KEEPALIVE_MS)
  }

  private clearTimers(): void {
    for (const timer of [this.reconnectTimer, this.pongTimer]) if (timer) clearTimeout(timer)
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
    this.reconnectTimer = this.pongTimer = this.keepaliveTimer = null
  }

  private send(line: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(line)
  }

  private setStatus(status: TwitchConnection): void {
    if (this.status === status) return
    this.status = status
    this.opts.onChange()
  }
}
