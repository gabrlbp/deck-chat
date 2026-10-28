import type { GameEvent } from '../../shared/ipc'

const MAX_EVENTS = 1000

/** Eventos das alts na sessão atual (F5.5: some ao fechar o app). Mais recente primeiro. */
export class EventFeed {
  private readonly onPush: (event: GameEvent) => void
  private events: GameEvent[] = []

  constructor(onPush: (event: GameEvent) => void) {
    this.onPush = onPush
  }

  push(event: GameEvent): void {
    this.events.unshift(event)
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS
    this.onPush(event)
  }

  list(): readonly GameEvent[] {
    return this.events
  }
}
