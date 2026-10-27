import type { WebContents } from 'electron'

// Spike S3: mede se o Chromium está segurando timers/frames do slot.
// Roda num "isolated world": compartilha o DOM com o jogo, mas não toca nas variáveis dele.

const PROBE_WORLD_ID = 1001

const INSTALL = `(() => {
  if (globalThis.__deckProbe) return
  const p = (globalThis.__deckProbe = { ticks: 0, frames: 0, since: performance.now() })
  setInterval(() => { p.ticks++ }, 1000)
  const loop = () => { p.frames++; requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
})()`

const READ = `(() => {
  const p = globalThis.__deckProbe
  if (!p) return null
  const now = performance.now()
  const r = { ticks: p.ticks, frames: p.frames, ms: now - p.since, visibility: document.visibilityState }
  p.ticks = 0
  p.frames = 0
  p.since = now
  return r
})()`

export type RawProbe = { ticks: number; frames: number; ms: number; visibility: 'visible' | 'hidden' | 'prerender' }

export async function installProbe(wc: WebContents): Promise<void> {
  await wc.executeJavaScriptInIsolatedWorld(PROBE_WORLD_ID, [{ code: INSTALL }])
}

export async function readProbe(wc: WebContents): Promise<RawProbe | null> {
  return (await wc.executeJavaScriptInIsolatedWorld(PROBE_WORLD_ID, [{ code: READ }])) as RawProbe | null
}
