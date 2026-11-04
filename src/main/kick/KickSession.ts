import { BrowserWindow, session, type Session, type WebContents } from 'electron'
import { log } from '../logger'
import { applyLivePolicy, trustedDomains } from '../live/policy'

export const KICK = 'https://kick.com'
export const KICK_PARTITION = 'persist:kick'
/** página "vazia" em kick.com: mesma origem e cookies do site, sem carregar o site inteiro */
const LIGHT_URL = `${KICK}/robots.txt`
const FETCH_TIMEOUT_MS = 20_000

/** Login pela Kick e pelos provedores que ela usa (popups na mesma sessão). */
const isTrusted = trustedDomains(['kick.com', 'google.com', 'accounts.youtube.com', 'apple.com', 'discord.com'], /^accounts\.google\.(com?\.)?[a-z]{2}$/)

export const applyKickPolicy = (wc: WebContents): void => applyLivePolicy(wc, KICK_PARTITION, isTrusted)

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

/**
 * Sessão da Kick da conta principal: login na página da própria Kick e consultas à API interna.
 * As consultas rodam de dentro de uma página em kick.com, com os cookies da sessão, como um navegador normal.
 */
export class KickSession {
  readonly ses: Session = session.fromPartition(KICK_PARTITION)
  private api: BrowserWindow | null = null
  private apiReady: Promise<void> | null = null
  private loginWin: BrowserWindow | null = null
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
    this.ses.setSpellCheckerEnabled(false)
    // nenhuma página da Kick precisa de câmera, microfone ou localização
    this.ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen'))
  }

  async token(): Promise<string> {
    const cookies = await this.ses.cookies.get({ url: KICK, name: 'session_token' })
    return cookies[0] ? decodeURIComponent(cookies[0].value) : ''
  }

  async isLoggedIn(): Promise<boolean> {
    return (await this.token()) !== ''
  }

  get loggingIn(): boolean {
    return this.loginWin !== null && !this.loginWin.isDestroyed()
  }

  /** PID da página de consultas, para o medidor de memória. */
  apiPid(): number | null {
    return this.api && !this.api.isDestroyed() ? this.api.webContents.getOSProcessId() : null
  }

  openLogin(): void {
    if (this.loggingIn) {
      this.loginWin?.focus()
      return
    }
    const win = new BrowserWindow({
      width: 1000,
      height: 760,
      title: 'Kick — entrar',
      autoHideMenuBar: true,
      webPreferences: { partition: KICK_PARTITION },
    })
    applyKickPolicy(win.webContents)
    win.webContents.setAudioMuted(true)
    void win.loadURL(`${KICK}/login`)
    win.on('closed', () => {
      this.loginWin = null
      void this.isLoggedIn().then((ok) => {
        log(`[kick] janela de login fechada · ${ok ? 'logado' : 'sem login'}`)
        // o login trocou os cookies: a página de consultas precisa recarregar
        if (ok) this.reloadApi()
        this.onChange()
      })
    })
    this.loginWin = win
    this.onChange()
  }

  async logout(): Promise<void> {
    await this.ses.clearStorageData()
    await this.ses.clearCache()
    await this.ses.clearAuthCache()
    log('[kick] sessão apagada (sair da conta)')
    this.reloadApi()
    this.onChange()
  }

  private ensureApi(): Promise<void> {
    if (this.api && !this.api.isDestroyed() && this.apiReady) return this.apiReady
    this.api = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: { partition: KICK_PARTITION, backgroundThrottling: false, spellcheck: false },
    })
    applyKickPolicy(this.api.webContents)
    this.api.webContents.setAudioMuted(true)
    this.api.webContents.on('render-process-gone', () => {
      this.apiReady = null
    })
    return this.reloadApi()
  }

  private reloadApi(): Promise<void> {
    if (!this.api || this.api.isDestroyed()) return Promise.resolve()
    const wc = this.api.webContents
    this.apiReady = new Promise((resolve) => {
      wc.once('did-finish-load', () => resolve())
      wc.once('did-fail-load', () => resolve())
    })
    void wc.loadURL(LIGHT_URL).catch(() => {})
    return this.apiReady
  }

  /** Pedido à API interna da Kick, de dentro de kick.com. */
  async fetch(path: string, post?: unknown): Promise<{ status: number; json: unknown }> {
    await withTimeout(this.ensureApi(), FETCH_TIMEOUT_MS)
    const token = await this.token()
    const code = `(async () => {
      const xsrf = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '');
      const headers = { Accept: 'application/json' };
      const token = ${JSON.stringify(token)};
      const post = ${JSON.stringify(post === undefined ? null : JSON.stringify(post))};
      if (token) headers.Authorization = 'Bearer ' + token;
      if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
      if (post) headers['Content-Type'] = 'application/json';
      const r = await fetch(${JSON.stringify(path)}, { headers, credentials: 'include', ...(post ? { method: 'POST', body: post } : {}) });
      return { status: r.status, text: await r.text() };
    })()`
    const api = this.api
    if (!api || api.isDestroyed()) throw new Error('página de consultas fechada')
    const res = (await withTimeout(api.webContents.executeJavaScript(code, true), FETCH_TIMEOUT_MS)) as {
      status: number
      text: string
    }
    let json: unknown = null
    try {
      json = JSON.parse(res.text)
    } catch {
      // Cloudflare ou HTML de erro
    }
    return { status: res.status, json }
  }

  dispose(): void {
    if (this.api && !this.api.isDestroyed()) this.api.destroy()
    this.api = null
    this.apiReady = null
  }
}
