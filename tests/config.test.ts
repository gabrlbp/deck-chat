import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../src/shared/schemas'

// Config como a v0.1.0 salva: sem hideGame nos slots e sem hardwareAcceleration.
const v010 = {
  version: 1,
  gameUrl: 'https://pokeidle.io',
  slots: ['slot-1', 'slot-2', 'slot-3', 'slot-4'].map((id, i) => ({
    id,
    label: `Alt ${i + 1}`,
    enabled: i < 3,
    muted: true,
    zoom: 1,
  })),
  twitch: { official: [{ login: 'axtlol', nome: 'aXtLOL' }], extras: [], disabled: [] },
  system: { startWithWindows: true, startHidden: true },
  window: { x: 0, y: 0, width: 1280, height: 800, maximized: true },
}

describe('ConfigSchema', () => {
  it('aceita a config da v0.1.0 e preenche os campos novos com o padrão', () => {
    const result = v.safeParse(ConfigSchema, v010)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.output.slots.every((s) => s.hideGame === false)).toBe(true)
    expect(result.output.system).toEqual({ startWithWindows: true, startHidden: true, hardwareAcceleration: true })
    expect(result.output.twitch.official).toHaveLength(1)
  })
})
