import type { GameEventKind } from '../../shared/ipc'

/** Evento ainda sem id, horário e slot: quem chama completa. */
export type EventDraft = { kind: GameEventKind; title: string; detail?: string }
