import type { SlotState } from '../../../shared/ipc'
import { ZOOM_MAX, ZOOM_MIN } from '../../../shared/schemas'

export function zoomBy(slot: SlotState, delta: number): void {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, slot.zoom + delta))
  window.deck.slots.setZoom(slot.id, Math.round(next * 10) / 10)
}

/** Nome exibido: o personagem logado; sem login, o rótulo do slot. */
export const slotName = (slot: SlotState) => slot.game.nick ?? slot.label
