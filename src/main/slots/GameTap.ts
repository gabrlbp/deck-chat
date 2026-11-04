import type { WebContents } from 'electron'
import type { EventDraft } from '../game/events'
import { SlotGame } from '../game/GameState'
import { decode } from '../game/messages'
import { battleDrafts } from '../game/parser'
import { spikeJsonl } from '../diagnostics/spikeLog'
import { log } from '../logger'

type WsFrameParams = { response: { opcode: number; payloadData: string } }

const WS_TEXT_OPCODE = 1

/** Spike S7: respostas do Mercado e das planilhas (CSV) que o jogo recebe quando você navega. */
const MARKET_IN = new Set(['market', 'csv', 'comercio'])
/** e os pedidos que a página manda, para conhecer os filtros. Só estes: o `hello` leva o token da sessão */
const isMarketRequest = (t: unknown) => typeof t === 'string' && (t.startsWith('market.') || t.startsWith('csv.'))

/**
 * Escuta (só leitura) as mensagens WebSocket que o servidor envia ao slot, via DevTools Protocol.
 * Mantém o estado da alt, gera eventos e mede se o jogo continua recebendo mensagens.
 */
export class GameTap {
  readonly game = new SlotGame()
  private readonly wc: WebContents
  private readonly slotId: string
  private readonly onDrafts: (drafts: EventDraft[]) => void
  private lastMessageAt = 0
  private armed = false
  private messagesInWindow = 0
  private windowStartedAt = Date.now()
  /** último bloco `kick` gravado (S6), para gravar só mudanças */
  private lastKick = ''

  constructor(wc: WebContents, slotId: string, onDrafts: (drafts: EventDraft[]) => void) {
    this.wc = wc
    this.slotId = slotId
    this.onDrafts = onDrafts

    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Network.webSocketFrameSent') return this.recordSent(params as WsFrameParams)
      if (method !== 'Network.webSocketFrameReceived') return
      const { response } = params as WsFrameParams
      if (response.opcode === WS_TEXT_OPCODE) this.ingest(response.payloadData)
    })
    wc.debugger.on('detach', (_event, reason) => log(`[${slotId}] escuta do jogo desconectada: ${reason}`))
  }

  /** Idempotente: chamar a cada carregamento (o debugger cai se o processo do slot cair). */
  async ensureAttached(): Promise<void> {
    if (this.wc.isDestroyed() || this.wc.debugger.isAttached()) return
    try {
      this.wc.debugger.attach('1.3')
      // buffers pequenos: só queremos os frames do WebSocket, não guardar respostas HTTP
      await this.wc.debugger.sendCommand('Network.enable', {
        maxTotalBufferSize: 1_000_000,
        maxResourceBufferSize: 100_000,
      })
    } catch (err) {
      log(`[${this.slotId}] falha ao ligar a escuta do jogo: ${String(err)}`)
    }
  }

  /** Nova página: o vigia só volta a valer depois da primeira mensagem do jogo. */
  resetForNavigation(): void {
    this.armed = false
  }

  /** Há quanto tempo o jogo não recebe nada; `null` enquanto o jogo não começou a falar. */
  silentForMs(now: number): number | null {
    return this.armed ? now - this.lastMessageAt : null
  }

  /** Mensagens por minuto desde a última chamada. */
  takeRatePerMin(now: number): number {
    const minutes = Math.max((now - this.windowStartedAt) / 60_000, 1 / 60)
    const rate = this.messagesInWindow / minutes
    this.messagesInWindow = 0
    this.windowStartedAt = now
    return rate
  }

  /** Uma mensagem de texto do servidor do jogo (público para o modo replay de desenvolvimento). */
  ingest(raw: string): void {
    const msg = decode(raw)
    if (!msg) return

    this.lastMessageAt = Date.now()
    this.armed = true
    this.messagesInWindow++

    if (msg.t === 'outro' && MARKET_IN.has(msg.tipo)) {
      spikeJsonl('s7-market', { slot: this.slotId, dir: 'in', msg: JSON.parse(raw) as unknown })
    }
    if (msg.t === 'estado' && msg.estado.kick !== undefined) this.recordKick(msg.estado.kick)

    const drafts =
      msg.t === 'batalha' ? battleDrafts(msg.ev) : msg.t === 'estado' ? this.game.apply(msg.estado) : []
    if (drafts.length) this.onDrafts(drafts)
  }

  private recordSent({ response }: WsFrameParams): void {
    if (response.opcode !== WS_TEXT_OPCODE || !response.payloadData.includes('"t"')) return
    let json: unknown
    try {
      json = JSON.parse(response.payloadData)
    } catch {
      return
    }
    if (typeof json === 'object' && json !== null && isMarketRequest((json as { t?: unknown }).t)) {
      spikeJsonl('s7-market', { slot: this.slotId, dir: 'out', msg: json })
    }
  }

  /** Spike S6: como o bônus da Kick aparece no jogo (vinculado, bônus ativos, lista oficial). */
  private recordKick(kick: unknown): void {
    const text = JSON.stringify(kick)
    if (text === this.lastKick) return
    this.lastKick = text
    spikeJsonl('s6-kick-game', { slot: this.slotId, kick })
  }
}
