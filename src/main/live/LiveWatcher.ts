import { BrowserWindow, type WebContents } from 'electron'
import { log } from '../logger'
import { lowestQualityOnly } from './hls'

const EVALUATE_TIMEOUT_MS = 5_000

type Options = {
  /** para logs: ex.: "kick · yetz" */
  label: string
  url: string
  partition: string
  size: { width: number; height: number }
  applyPolicy: (wc: WebContents) => void
  /** a página caiu ou não carregou */
  onGone: () => void
}

/**
 * Uma live aberta para contar pontos: a página real do canal, sem som, com a playlist reescrita para a
 * menor qualidade. O S6 mostrou que precisa do vídeo tocando; sem vídeo ou só com o chat não conta.
 */
export class LiveWatcher {
  readonly since = Date.now()
  readonly win: BrowserWindow
  /** guardado: depois de fechada, a janela não responde mais */
  readonly webContentsId: number

  constructor(private readonly opts: Options) {
    this.win = new BrowserWindow({
      show: false,
      ...opts.size,
      x: 0,
      y: 0,
      title: opts.label,
      skipTaskbar: true,
      focusable: false,
      autoHideMenuBar: true,
      webPreferences: { partition: opts.partition, backgroundThrottling: false, spellcheck: false },
    })
    const wc = this.win.webContents
    this.webContentsId = wc.id
    wc.setAudioMuted(true)
    opts.applyPolicy(wc)
    this.instrument()

    const drop = (why: string) => {
      log(`[${opts.label}] ${why}`)
      setImmediate(opts.onGone)
    }
    wc.on('render-process-gone', (_e, details) => drop(`página caiu (${details.reason})`))
    wc.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) drop(`falha ao carregar (${desc})`)
    })

    void this.win.loadURL(opts.url).catch(() => {})
  }

  pid(): number | null {
    return this.win.isDestroyed() ? null : this.win.webContents.getOSProcessId()
  }

  /** Roda um script na página. `null` = não respondeu a tempo. */
  async evaluate<T>(code: string): Promise<T | null> {
    if (this.win.isDestroyed()) return null
    try {
      return await Promise.race([
        this.win.webContents.executeJavaScript(code) as Promise<T>,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), EVALUATE_TIMEOUT_MS)),
      ])
    } catch {
      return null
    }
  }

  /** Estado do player para diagnóstico. O tempo do vídeo não indica se conta (S6: fica em 0–1 s com os pontos subindo). */
  async probeVideo(): Promise<string> {
    const state = await this.evaluate<string>(`(() => {
      const v = document.querySelector('video');
      if (!v) return 'sem player';
      return (v.paused ? 'pausado' : v.readyState >= 3 ? 'tocando' : 'carregando') + (v.videoHeight ? ' ' + v.videoHeight + 'p' : '');
    })()`)
    return state ?? 'sem resposta'
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.destroy()
  }

  /** DevTools Protocol: troca a playlist mestre pela menor qualidade. */
  private instrument(): void {
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
