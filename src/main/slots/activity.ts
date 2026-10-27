import type { WebContents } from 'electron'
import { log } from '../logger'

// Spike S3: mede a atividade real do jogo contando o tráfego de rede do slot via DevTools Protocol.
// Se o jogo desacelera em segundo plano, ele passa a trocar menos mensagens com o servidor.

export type ActivityCounts = { http: number; wsSent: number; wsRecv: number }

const empty = (): ActivityCounts => ({ http: 0, wsSent: 0, wsRecv: 0 })

export class ActivityMonitor {
  private readonly wc: WebContents
  private readonly slotId: string
  private counts = empty()

  constructor(wc: WebContents, slotId: string) {
    this.wc = wc
    this.slotId = slotId

    wc.debugger.on('message', (_event, method) => {
      if (method === 'Network.requestWillBeSent') this.counts.http++
      else if (method === 'Network.webSocketFrameSent') this.counts.wsSent++
      else if (method === 'Network.webSocketFrameReceived') this.counts.wsRecv++
    })
    wc.debugger.on('detach', (_event, reason) => log(`[${slotId}] monitor de rede desconectado: ${reason}`))
  }

  /** Idempotente: chamar a cada carregamento (o debugger cai se o processo do slot cair). */
  async ensureAttached(): Promise<void> {
    if (this.wc.isDestroyed() || this.wc.debugger.isAttached()) return
    try {
      this.wc.debugger.attach('1.3')
      // buffers pequenos: só queremos contar eventos, não guardar respostas
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
