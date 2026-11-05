import * as v from 'valibot'

export const SLOT_IDS = ['slot-1', 'slot-2', 'slot-3', 'slot-4'] as const

export const SlotIdSchema = v.picklist(SLOT_IDS)
export type SlotId = v.InferOutput<typeof SlotIdSchema>

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 1.5

const ZoomSchema = v.pipe(v.number(), v.minValue(ZOOM_MIN), v.maxValue(ZOOM_MAX))
const PixelSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export const BoundsSchema = v.object({
  x: PixelSchema,
  y: PixelSchema,
  width: PixelSchema,
  height: PixelSchema,
})
export type Bounds = v.InferOutput<typeof BoundsSchema>

export const SlotConfigSchema = v.object({
  id: SlotIdSchema,
  label: v.pipe(v.string(), v.trim(), v.maxLength(32)),
  enabled: v.boolean(),
  muted: v.boolean(),
  zoom: ZoomSchema,
})
export type SlotConfig = v.InferOutput<typeof SlotConfigSchema>

export const BONUS_TYPES = ['xp', 'captura', 'shiny'] as const
export type BonusType = (typeof BONUS_TYPES)[number]

/** Farm de pontos da Kick (S6: live escondida com vídeo conta; só 2 lives contam por conta). */
export const KickConfigSchema = v.object({
  /** 0 = desligado */
  lives: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2)),
  /** `none` só avisa; `one` resgata o bônus escolhido; `all` resgata os três, mirando o de menor tempo restante */
  redeem: v.picklist(['none', 'one', 'all']),
  redeemType: v.picklist(BONUS_TYPES),
})
export type KickConfig = v.InferOutput<typeof KickConfigSchema>

const defaultKickConfig = (): KickConfig => ({ lives: 2, redeem: 'none', redeemType: 'xp' })

export const MEMORY_RELOAD_MIN_MB = 300
export const MEMORY_RELOAD_MAX_MB = 2000
export const MEMORY_RELOAD_DEFAULT_MB = 500

const MemoryReloadSchema = v.object({
  enabled: v.boolean(),
  limitMb: v.pipe(v.number(), v.integer(), v.minValue(MEMORY_RELOAD_MIN_MB), v.maxValue(MEMORY_RELOAD_MAX_MB)),
})

export const SystemConfigSchema = v.object({
  startWithWindows: v.boolean(),
  /** ao iniciar com o Windows, já ir direto para a bandeja */
  startHidden: v.boolean(),
  /** ligada, o processo de GPU usa ~850–1000 MB de RAM (S5); desligada, o desenho vai para a CPU. Vale após reiniciar */
  hardwareAcceleration: v.optional(v.boolean(), false),
  /** recarrega o slot que passar do limite (F8): os slots crescem ~13–30 MB/h (S5) */
  memoryReload: v.optional(MemoryReloadSchema, () => ({ enabled: true, limitMb: MEMORY_RELOAD_DEFAULT_MB })),
})
export type SystemConfig = v.InferOutput<typeof SystemConfigSchema>

const defaultSystemConfig = (): SystemConfig => ({
  startWithWindows: false,
  startHidden: true,
  hardwareAcceleration: false,
  memoryReload: { enabled: true, limitMb: MEMORY_RELOAD_DEFAULT_MB },
})

export const WindowStateSchema = v.object({
  x: v.number(),
  y: v.number(),
  width: v.pipe(v.number(), v.minValue(400)),
  height: v.pipe(v.number(), v.minValue(300)),
  maximized: v.boolean(),
})
export type WindowState = v.InferOutput<typeof WindowStateSchema>

/** v2: GPU desligada por padrão (S5). A migração da v1 fica em main/store.ts */
export const CONFIG_VERSION = 2

export const ConfigSchema = v.object({
  version: v.literal(CONFIG_VERSION),
  gameUrl: v.pipe(v.string(), v.url()),
  slots: v.pipe(v.array(SlotConfigSchema), v.length(SLOT_IDS.length)),
  // opcionais com padrão: configs salvas por versões anteriores continuam válidas
  kick: v.optional(KickConfigSchema, defaultKickConfig),
  system: v.optional(SystemConfigSchema, defaultSystemConfig),
  window: v.optional(WindowStateSchema),
})
export type Config = v.InferOutput<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = {
  version: CONFIG_VERSION,
  gameUrl: 'https://pokeidle.io',
  slots: SLOT_IDS.map((id, i) => ({
    id,
    label: i < 3 ? `Alt ${'ABC'[i]}` : 'Slot 4',
    enabled: i < 3,
    muted: true,
    zoom: 1,
  })),
  kick: defaultKickConfig(),
  system: defaultSystemConfig(),
}

// Payloads IPC (renderer → main). O main valida tudo antes de usar.
export const SetBoundsPayload = v.object({ id: SlotIdSchema, bounds: BoundsSchema })
export const SetMutedPayload = v.object({ id: SlotIdSchema, muted: v.boolean() })
export const SetEnabledPayload = v.object({ id: SlotIdSchema, enabled: v.boolean() })
export const SetZoomPayload = v.object({ id: SlotIdSchema, zoom: ZoomSchema })
export const SlotIdPayload = v.object({ id: SlotIdSchema })
export const SetLabelPayload = v.object({ id: SlotIdSchema, label: SlotConfigSchema.entries.label })
export const SetVisiblePayload = v.object({ visible: v.boolean() })
export const SetSystemPayload = v.partial(SystemConfigSchema)
export const SetFocusPayload = v.object({ id: v.nullable(SlotIdSchema) })
export const SetKickPayload = v.partial(KickConfigSchema)
/** canal da Kick: letras, números, _ e - */
export const ChannelSlugPayload = v.object({ slug: v.pipe(v.string(), v.regex(/^[a-z0-9_-]{1,40}$/i)) })
