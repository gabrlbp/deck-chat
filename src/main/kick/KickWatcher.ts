import { BrowserWindow } from 'electron'
import { log } from '../logger'
import { lowestQualityOnly } from './hls'
import { applyKickPolicy, KICK, KICK_PARTITION } from './KickSession'

export type WatchMode = { page: 'live' | 'chat'; video: boolean; window: 'hidden' | 'transparent' }

const PROBE_TIMEOUT_MS = 5_000

/**
 * Uma live aberta para contar pontos: a página real da Kick, sem som.
 * - `hidden`: janela nunca mostrada (o que queremos validar no S6)
 * - `transparent`: o plano B do Kickterino, janela "mostrada" com opacidade 0, sem clique e fora da barra de tarefas
 * Com vídeo, a playlist é reescrita para 160p; sem vídeo, a sessão bloqueia os pedidos de vídeo (ver KickSpike).
 */
export class KickWatcher {
  readonly slug: string
  readonly mode: WatchMode
  readonly since = Date.now()
  readonly win: BrowserWindow
  /** guardado: depois de fechada, a janela não responde mais */
  readonly webContentsId: number
  private readonly onGone: () => void

  constructor(slug: string, mode: WatchMode, onGone: () => void) {
    this.slug = slug
    this.mode = mode
    this.onGone = onGone
    this.win = new BrowserWindow({
      show: false,
      width: 480,
      height: 270,
      x: 0,
      y: 0,
      title: `Kick — ${slug}`,
      skipTaskbar: true,
      focusable: false,
      autoHideMenuBar: true,
      ...(mode.window === 'transparent' ? { type: 'toolbar', opacity: 0 } : {}),
      webPreferences: { partition: KICK_PARTITION, backgroundThrottling: false, spellcheck: false },
    })
    const wc = this.win.webContents
    this.webContentsId = wc.id
    wc.setAudioMuted(true)
    applyKickPolicy(wc)
    if (mode.video) this.forceLowestQuality()

    const drop = (why: string) => {
      log(`[kick] ${slug}: ${why}`)
      setImmediate(this.onGone)
    }
    wc.on('render-process-gone', (_e, details) => drop(`página caiu (${details.reason})`))
    wc.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) drop(`falha ao carregar (${desc})`)
    })

    // `chat`: só o chat popout do canal, sem player (fase K5)
    const url = mode.page === 'chat' ? `${KICK}/popout/${slug}/chat` : `${KICK}/${slug}`
    void this.win.loadURL(url).catch(() => {})
    if (mode.window === 'transparent') {
      this.win.setIgnoreMouseEvents(true)
      this.win.showInactive()
    }
  }

  pid(): number | null {
    return this.win.isDestroyed() ? null : this.win.webContents.getOSProcessId()
  }

  /** Estado do player para o CSV: o Kickterino viu o tempo parado com os pontos subindo, então é só diagnóstico. */
  async probe(): Promise<string> {
    if (this.win.isDestroyed()) return 'fechada'
    const code = `(() => {
      const v = document.querySelector('video');
      const gate = !!document.querySelector('[data-testid="mature"]');
      if (!v) return (gate ? '+18 ' : '') + 'sem player';
      const state = v.paused ? 'pausado' : v.readyState >= 3 ? 'tocando' : 'carregando';
      return (gate ? '+18 ' : '') + state + ' ' + (v.videoHeight ? v.videoHeight + 'p ' : '') + Math.round(v.currentTime) + 's';
    })()`
    try {
      return (await Promise.race([
        this.win.webContents.executeJavaScript(code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS)),
      ])) as string
    } catch (err) {
      return `sem resposta (${String(err instanceof Error ? err.message : err)})`
    }
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.destroy()
  }

  /** DevTools Protocol: troca a playlist mestre por uma só com a menor qualidade. */
  private forceLowestQuality(): void {
    const dbg = this.win.webContents.debugger
    try {
      dbg.attach('1.3')
    } catch {
      return
    }
    dbg.on('message', (_e, method, params) => {
      if (method !== 'Fetch.requestPaused') return
      const p = params as { requestId: string; responseStatusCode?: number; responseHeaders?: unknown[] }
      const pass = () => dbg.sendCommand('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {})
      void (async () => {
        try {
          const { body, base64Encoded } = (await dbg.sendCommand('Fetch.getResponseBody', { requestId: p.requestId })) as {
            body: string
            base64Encoded: boolean
          }
          const text = base64Encoded ? Buffer.from(body, 'base64').toString() : body
          const low = text.includes('#EXT-X-STREAM-INF') ? lowestQualityOnly(text) : null
          if (!low) return void pass()
          await dbg.sendCommand('Fetch.fulfillRequest', {
            requestId: p.requestId,
            responseCode: p.responseStatusCode ?? 200,
            responseHeaders: p.responseHeaders,
            body: Buffer.from(low).toString('base64'),
          })
        } catch {
          void pass()
        }
      })()
    })
    void dbg.sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*.m3u8*', requestStage: 'Response' }] }).catch(() => {})
  }
}
