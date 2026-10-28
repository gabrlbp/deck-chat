import type { WebContents } from 'electron'
import type { EventDraft } from '../game/events'
import { SlotGame } from '../game/GameState'
import { decode } from '../game/messages'
import { battleDrafts } from '../game/parser'
import { log } from '../logger'

type WsFrameParams = { response: { opcode: number; payloadData: string } }

const WS_TEXT_OPCODE = 1

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

  constructor(wc: WebContents, slotId: string, onDrafts: (drafts: EventDraft[]) => void) {
    this.wc = wc
    this.slotId = slotId
    this.onDrafts = onDrafts

    wc.debugger.on('message', (_event, method, params) => {
      if (method !== 'Network.webSocketFrameReceived') return
      const { response } = params as WsFrameParams
      if (response.opcode === WS_TEXT_OPCODE) this.onFrame(response.payloadData)
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

  private onFrame(raw: string): void {
    const msg = decode(raw)
    if (!msg) return

    this.lastMessageAt = Date.now()
    this.armed = true
    this.messagesInWindow++

    const drafts =
      msg.t === 'batalha' ? battleDrafts(msg.ev) : msg.t === 'estado' ? this.game.apply(msg.estado) : []
    if (drafts.length) this.onDrafts(drafts)
  }
}
