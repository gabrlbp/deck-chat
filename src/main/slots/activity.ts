import type { WebContents } from 'electron'
import { log } from '../logger'
import type { WsRecorder } from './recorder'

// Mede a atividade real do jogo contando o tráfego de rede do slot via DevTools Protocol.
// O jogo é controlado pelo servidor (S3): sem mensagens recebidas, a alt parou.

export type ActivityCounts = { http: number; wsSent: number; wsRecv: number }

type WsFrameParams = { requestId: string; response: { opcode: number; payloadData: string } }

const empty = (): ActivityCounts => ({ http: 0, wsSent: 0, wsRecv: 0 })

export class ActivityMonitor {
  private readonly wc: WebContents
  private readonly slotId: string
  private counts = empty()

  constructor(wc: WebContents, slotId: string, recorder: WsRecorder) {
    this.wc = wc
    this.slotId = slotId

    wc.debugger.on('message', (_event, method, params) => {
      switch (method) {
        case 'Network.requestWillBeSent':
          this.counts.http++
          break
        case 'Network.webSocketCreated': {
          const p = params as { requestId: string; url: string }
          log(`[${slotId}] WebSocket aberto: ${p.url}`)
          recorder.socketOpened(slotId, p.requestId, p.url)
          break
        }
        case 'Network.webSocketFrameSent': {
          const p = params as WsFrameParams
          this.counts.wsSent++
          recorder.frame(slotId, 'out', p.requestId, p.response.opcode, p.response.payloadData)
          break
        }
        case 'Network.webSocketFrameReceived': {
          const p = params as WsFrameParams
          this.counts.wsRecv++
          recorder.frame(slotId, 'in', p.requestId, p.response.opcode, p.response.payloadData)
          break
        }
      }
    })
    wc.debugger.on('detach', (_event, reason) => log(`[${slotId}] monitor de rede desconectado: ${reason}`))
  }

  /** Idempotente: chamar a cada carregamento (o debugger cai se o processo do slot cair). */
  async ensureAttached(): Promise<void> {
    if (this.wc.isDestroyed() || this.wc.debugger.isAttached()) return
    try {
      this.wc.debugger.attach('1.3')
      // buffers pequenos: só queremos os eventos, não guardar respostas HTTP
      await this.wc.debugger.sendCommand('Network.enable', {
        maxTotalBufferSize: 1_000_000,
        maxResourceBufferSize: 100_000,
      })
    } catch (err) {
      log(`[${this.slotId}] falha ao ligar monitor de rede: ${String(err)}`)
    }
  }

  /** Retorna as contagens desde a última chamada e zera. */
  take(): ActivityCounts {
    const counts = this.counts
    this.counts = empty()
    return counts
  }
}
