import { shell, type WebContents } from 'electron'

/** Páginas de live só navegam no próprio site e nos logins que ele usa; o resto vai para o navegador. */
export function applyLivePolicy(wc: WebContents, partition: string, isTrusted: (url: string) => boolean): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (isTrusted(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, webPreferences: { partition } },
      }
    }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const guard = (event: { url: string; isMainFrame: boolean; preventDefault: () => void }) => {
    if (event.isMainFrame && !isTrusted(event.url)) event.preventDefault()
  }
  wc.on('will-navigate', guard)
  wc.on('will-redirect', guard)
  wc.on('did-create-window', (popup) => applyLivePolicy(popup.webContents, partition, isTrusted))
}

/** Domínios aceitos, com subdomínios; só https. `about:blank` é o estado inicial dos popups. */
export function trustedDomains(domains: string[], extra?: RegExp): (url: string) => boolean {
  return (url) => {
    if (url === 'about:blank') return true
    try {
      const { protocol, hostname } = new URL(url)
      return (
        protocol === 'https:' &&
        (extra?.test(hostname) === true || domains.some((d) => hostname === d || hostname.endsWith(`.${d}`)))
      )
    } catch {
      return false
    }
  }
}
