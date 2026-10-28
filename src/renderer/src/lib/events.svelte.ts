import type { GameEvent, GameEventKind } from '../../../shared/ipc'

const MAX_EVENTS = 1000

/** Feed da aba Notificações (só da sessão, F5.5). Mais recente primeiro. */
export const feed = $state<{ events: GameEvent[]; unread: number }>({ events: [], unread: 0 })

export const KINDS: Record<GameEventKind, { icon: string; label: string }> = {
  shiny: { icon: '✨', label: 'Shiny' },
  drop: { icon: '📦', label: 'Drops' },
  capture: { icon: '🎯', label: 'Capturas' },
  problem: { icon: '⚠️', label: 'Problemas' },
}

/** Liga o feed ao main. `isReading` diz se a aba Notificações está aberta (não conta como não lido). */
export function connectFeed(isReading: () => boolean): () => void {
  void window.deck.events.list().then((initial) => {
    const known = new Set(feed.events.map((e) => e.id))
    feed.events = [...feed.events, ...initial.filter((e) => !known.has(e.id))].slice(0, MAX_EVENTS)
  })
  return window.deck.events.onNew((event) => {
    feed.events.unshift(event)
    if (feed.events.length > MAX_EVENTS) feed.events.length = MAX_EVENTS
    if (!isReading()) feed.unread++
  })
}

export function clearFeed(): void {
  window.deck.events.clear()
  feed.events = []
  feed.unread = 0
}
