import type { WebContents } from 'electron'
import type { EventDraft } from '../game/events'
import { SlotGame } from '../game/GameState'
import { decode } from '../game/messages'
import { battleDrafts } from '../game/parser'
import { log } from '../logger'

type WsFrameParams = { response: { opcode: number; payloadData: string } }

const WS_TEXT_OPCODE = 1
/** Mensagens do Mercado, repassadas ao MarketService */
const MARKET_TYPES = new Set(['market', 'csv'])

/**
 * Escuta (só leitura) as mensagens WebSocket que o servidor envia ao slot, via DevTools Protocol.
 * Mantém o estado da alt, gera eventos e mede se o jogo continua recebendo mensagens.
 */
export class GameTap {
  readonly game = new SlotGame()
  private readonly wc: WebContents
  private readonly slotId: string
  private readonly onDrafts: (drafts: EventDraft[]) => void
  private readonly onMarket: (msg: Record<string, unknown>) => void
  private lastMessageAt = 0
  private armed = false
  private messagesInWindow = 0
  private windowStartedAt = Date.now()

  constructor(
    wc: WebContents,
    slotId: string,
    onDrafts: (drafts: EventDraft[]) => void,
    onMarket: (msg: Record<string, unknown>) => void,
  ) {
    this.wc = wc
    this.slotId = slotId
    this.onDrafts = onDrafts
    this.onMarket = onMarket

    wc.debugger.on('message', (_event, method, params) => {
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

    if (msg.t === 'outro' && MARKET_TYPES.has(msg.tipo)) this.onMarket(JSON.parse(raw) as Record<string, unknown>)

    const drafts =
      msg.t === 'batalha' ? battleDrafts(msg.ev) : msg.t === 'estado' ? this.game.apply(msg.estado) : []
    if (drafts.length) this.onDrafts(drafts)
  }

  /**
   * Manda uma mensagem pela conexão que a própria página do jogo já abriu, sem alterar a página: o DevTools
   * Protocol acha o WebSocket aberto e chama `send` nele. `false` = nenhuma conexão com o jogo aberta.
   */
  async send(message: Record<string, unknown>, gameHost: string): Promise<boolean> {
    if (this.wc.isDestroyed() || !this.wc.debugger.isAttached()) return false
    const dbg = this.wc.debugger
    const group = 'deck-send'
    try {
      const proto = (await dbg.sendCommand('Runtime.evaluate', { expression: 'WebSocket.prototype', objectGroup: group })) as {
        result: { objectId: string }
      }
      const sockets = (await dbg.sendCommand('Runtime.queryObjects', {
        prototypeObjectId: proto.result.objectId,
        objectGroup: group,
      })) as { objects: { objectId: string } }
      const sent = (await dbg.sendCommand('Runtime.callFunctionOn', {
        objectId: sockets.objects.objectId,
        functionDeclaration: `function (text, host) {
          const socket = this.filter((ws) => ws.readyState === 1 && new URL(ws.url).hostname.endsWith(host)).at(-1);
          if (!socket) return false;
          socket.send(text);
          return true;
        }`,
        arguments: [{ value: JSON.stringify(message) }, { value: gameHost }],
        returnByValue: true,
      })) as { result: { value?: boolean } }
      return sent.result.value === true
    } catch (err) {
      log(`[${this.slotId}] falha ao enviar pedido ao jogo: ${String(err)}`)
      return false
    } finally {
      void dbg.sendCommand('Runtime.releaseObjectGroup', { objectGroup: group }).catch(() => {})
    }
  }
}
