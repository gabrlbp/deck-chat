import type { SlotId } from '../../shared/schemas'

/**
 * F8: os slots crescem ~13–30 MB/h (S5) e recarregar devolve a memória.
 * Recarrega o slot que passou do limite, com freios para não atrapalhar.
 */

/** cada slot no máximo 1x por hora */
export const PER_SLOT_INTERVAL_MS = 60 * 60_000
/** um recarregamento por vez: espera entre dois recarregamentos de slots diferentes */
export const GLOBAL_GAP_MS = 5 * 60_000

export type GuardSlot = {
  id: SlotId
  memoryMb: number
  /** só recarrega slot carregado e respondendo */
  ok: boolean
  /** na tela com a janela em foco: você pode estar usando, então espera */
  inUse: boolean
  lastReloadAt?: number
}

export function pickSlotToReload(
  slots: GuardSlot[],
  limitMb: number,
  now: number,
  lastAnyReloadAt: number | undefined,
): SlotId | null {
  if (lastAnyReloadAt !== undefined && now - lastAnyReloadAt < GLOBAL_GAP_MS) return null
  const candidates = slots.filter(
    (s) =>
      s.ok &&
      !s.inUse &&
      s.memoryMb > limitMb &&
      (s.lastReloadAt === undefined || now - s.lastReloadAt >= PER_SLOT_INTERVAL_MS),
  )
  candidates.sort((a, b) => b.memoryMb - a.memoryMb)
  return candidates[0]?.id ?? null
}
