import { describe, expect, it } from 'vitest'
import { GLOBAL_GAP_MS, PER_SLOT_INTERVAL_MS, pickSlotToReload, type GuardSlot } from '../src/main/diagnostics/memoryGuard'
import { nextRecovery, retryDelay, startRecovery } from '../src/main/slots/recovery'

const MIN = 60_000

describe('recuperação após o vigia recarregar (B2)', () => {
  it('tenta de novo em 3, 6, 12 e depois a cada 15 min', () => {
    expect([0, 1, 2, 3, 4, 10].map((a) => retryDelay(a) / MIN)).toEqual([3, 6, 12, 15, 15, 15])
  })

  it('cada tentativa agenda a próxima a partir de agora', () => {
    let r = startRecovery(0)
    expect(r).toEqual({ attempt: 0, nextAt: 3 * MIN })
    r = nextRecovery(r, 3 * MIN)
    expect(r).toEqual({ attempt: 1, nextAt: 9 * MIN })
    r = nextRecovery(r, 9 * MIN)
    expect(r).toEqual({ attempt: 2, nextAt: 21 * MIN })
  })
})

describe('recarregamento por limite de memória (F8)', () => {
  const now = 10 * 60 * MIN
  const slot = (id: GuardSlot['id'], memoryMb: number, extra: Partial<GuardSlot> = {}): GuardSlot => ({
    id,
    memoryMb,
    ok: true,
    inUse: false,
    ...extra,
  })

  it('escolhe o slot com mais memória acima do limite', () => {
    const slots = [slot('slot-1', 480), slot('slot-2', 560), slot('slot-3', 620)]
    expect(pickSlotToReload(slots, 500, now, undefined)).toBe('slot-3')
  })

  it('ninguém acima do limite: não recarrega', () => {
    expect(pickSlotToReload([slot('slot-1', 499)], 500, now, undefined)).toBeNull()
  })

  it('pula slot em uso, com problema ou recarregado há menos de 1 h', () => {
    const slots = [
      slot('slot-1', 900, { inUse: true }),
      slot('slot-2', 800, { ok: false }),
      slot('slot-3', 700, { lastReloadAt: now - PER_SLOT_INTERVAL_MS + MIN }),
      slot('slot-4', 600, { lastReloadAt: now - PER_SLOT_INTERVAL_MS }),
    ]
    expect(pickSlotToReload(slots, 500, now, undefined)).toBe('slot-4')
  })

  it('um por vez: espera 5 min depois de qualquer recarregamento', () => {
    const slots = [slot('slot-1', 700)]
    expect(pickSlotToReload(slots, 500, now, now - GLOBAL_GAP_MS + MIN)).toBeNull()
    expect(pickSlotToReload(slots, 500, now, now - GLOBAL_GAP_MS)).toBe('slot-1')
  })
})
