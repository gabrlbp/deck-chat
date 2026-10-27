import { shell, type BrowserWindow, type WebContents } from 'electron'
import { log } from '../logger'

const BLANK_POPUP_TIMEOUT_MS = 10_000

function isGameUrl(url: string, gameUrl: string): boolean {
  try {
    const host = new URL(url).hostname
    const gameHost = new URL(gameUrl).hostname
    return host === gameHost || host.endsWith(`.${gameHost}`)
  } catch {
    return false
  }
}

const isBlank = (url: string) => url === '' || url === 'about:blank'

function openInBrowser(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

/**
 * Popups abertos vazios (window.open() / about:blank) e só depois direcionados.
 * Nascem escondidos; quando o destino aparece: jogo → mostra, externo → navegador, nada → fecha.
 */
function watchBlankPopup(popup: BrowserWindow, gameUrl: string, slotId: string): void {
  const timeout = setTimeout(() => {
    if (popup.isDestroyed() || popup.isVisible()) return
    log(`[${slotId}] popup vazio fechado após ${BLANK_POPUP_TIMEOUT_MS / 1000}s sem destino`)
    popup.destroy()
  }, BLANK_POPUP_TIMEOUT_MS)

  popup.webContents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument || isBlank(details.url)) return
    clearTimeout(timeout)
    if (isGameUrl(details.url, gameUrl)) {
      log(`[${slotId}] popup vazio foi para o jogo, mostrando: ${details.url}`)
      popup.show()
    } else {
      log(`[${slotId}] popup vazio foi para fora, abrindo no navegador: ${details.url}`)
      openInBrowser(details.url)
      popup.destroy()
    }
  })
  popup.on('closed', () => clearTimeout(timeout))
}

/** O slot só navega dentro do domínio do jogo; o resto abre no navegador padrão. */
export function applySlotPolicy(wc: WebContents, gameUrl: string, slotId: string): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (isBlank(url)) {
      log(`[${slotId}] popup vazio aberto pelo jogo (frame ${wc.getURL()}), aguardando destino`)
      return { action: 'allow', overrideBrowserWindowOptions: { show: false, autoHideMenuBar: true } }
    }
    if (isGameUrl(url, gameUrl)) {
      log(`[${slotId}] popup do jogo permitido: ${url}`)
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } }
    }
    log(`[${slotId}] link externo aberto no navegador: ${url}`)
    openInBrowser(url)
    return { action: 'deny' }
  })

  wc.on('did-create-window', (popup, details) => {
    // o popup herda a sessão do slot; aplica a mesma política nele
    applySlotPolicy(popup.webContents, gameUrl, `${slotId}/popup`)
    if (isBlank(details.url)) watchBlankPopup(popup, gameUrl, slotId)
  })

  wc.on('will-navigate', (event) => {
    if (isGameUrl(event.url, gameUrl)) return
    event.preventDefault()
    log(`[${slotId}] navegação externa bloqueada → navegador: ${event.url}`)
    openInBrowser(event.url)
  })
}
