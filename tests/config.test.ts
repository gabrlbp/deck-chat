import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { migrateConfig } from '../src/main/migrations'
import { ConfigSchema } from '../src/shared/schemas'

const slots = ['slot-1', 'slot-2', 'slot-3', 'slot-4'].map((id, i) => ({
  id,
  label: `Alt ${i + 1}`,
  enabled: i < 3,
  muted: true,
  zoom: 1,
}))

// Config como a v0.1.0 salva: sem hardwareAcceleration nem memoryReload.
const v010 = {
  version: 1,
  gameUrl: 'https://pokeidle.io',
  slots,
  twitch: { official: [{ login: 'axtlol', nome: 'aXtLOL' }], extras: [], disabled: [] },
  system: { startWithWindows: true, startHidden: true },
  window: { x: 0, y: 0, width: 1280, height: 800, maximized: true },
}

// Config como a v0.1.1 salva: GPU ligada gravada por padrão e hideGame (removido) nos slots.
const v011 = {
  ...v010,
  slots: slots.map((s) => ({ ...s, hideGame: false })),
  system: { startWithWindows: true, startHidden: true, hardwareAcceleration: true },
}

const load = (raw: unknown) => v.parse(ConfigSchema, migrateConfig(raw).config)

describe('config', () => {
  it('v0.1.0 migra para v2 com GPU desligada e recarregamento por memória ligado', () => {
    const config = load(v010)
    expect(config.version).toBe(2)
    expect(config.system).toEqual({
      startWithWindows: true,
      startHidden: true,
      hardwareAcceleration: false,
      memoryReload: { enabled: true, limitMb: 500 },
    })
    // a lista antiga da Twitch sai sem invalidar a config, e o farm da Kick começa sem gastar pontos
    expect(config).not.toHaveProperty('twitch')
    expect(config.kick).toEqual({ lives: 2, redeem: 'none', redeemType: 'xp' })
    expect(config.window?.maximized).toBe(true)
  })

  it('v0.1.1 migra desligando a GPU e descarta o hideGame', () => {
    const config = load(v011)
    expect(config.system.hardwareAcceleration).toBe(false)
    expect(config.slots[0]).not.toHaveProperty('hideGame')
  })

  it('config v2 não é migrada de novo: a escolha de religar a GPU é respeitada', () => {
    const v2 = { ...v011, version: 2, system: { ...v011.system, hardwareAcceleration: true } }
    expect(migrateConfig(v2).migrated).toBe(false)
    expect(load(v2).system.hardwareAcceleration).toBe(true)
  })
})
