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

export const TwitchLoginSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^[a-z0-9_]{2,25}$/, 'nome de canal inválido'),
)

export const TwitchConfigSchema = v.object({
  /** última lista oficial recebida do jogo; usada ao abrir, antes dos slots carregarem */
  official: v.array(v.object({ login: TwitchLoginSchema, nome: v.string() })),
  extras: v.array(TwitchLoginSchema),
  disabled: v.array(TwitchLoginSchema),
})
export type TwitchConfig = v.InferOutput<typeof TwitchConfigSchema>

const defaultTwitchConfig = (): TwitchConfig => ({ official: [], extras: [], disabled: [] })

export const SystemConfigSchema = v.object({
  startWithWindows: v.boolean(),
  /** ao iniciar com o Windows, já ir direto para a bandeja */
  startHidden: v.boolean(),
})
export type SystemConfig = v.InferOutput<typeof SystemConfigSchema>

const defaultSystemConfig = (): SystemConfig => ({ startWithWindows: false, startHidden: true })

export const WindowStateSchema = v.object({
  x: v.number(),
  y: v.number(),
  width: v.pipe(v.number(), v.minValue(400)),
  height: v.pipe(v.number(), v.minValue(300)),
  maximized: v.boolean(),
})
export type WindowState = v.InferOutput<typeof WindowStateSchema>

export const ConfigSchema = v.object({
  version: v.literal(1),
  gameUrl: v.pipe(v.string(), v.url()),
  slots: v.pipe(v.array(SlotConfigSchema), v.length(SLOT_IDS.length)),
  // opcionais com padrão: configs salvas por versões anteriores continuam válidas
  twitch: v.optional(TwitchConfigSchema, defaultTwitchConfig),
  system: v.optional(SystemConfigSchema, defaultSystemConfig),
  window: v.optional(WindowStateSchema),
})
export type Config = v.InferOutput<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = {
  version: 1,
  gameUrl: 'https://pokeidle.io',
  slots: SLOT_IDS.map((id, i) => ({
    id,
    label: i < 3 ? `Alt ${'ABC'[i]}` : 'Slot 4',
    enabled: i < 3,
    muted: true,
    zoom: 1,
  })),
  twitch: defaultTwitchConfig(),
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
export const ChannelPayload = v.object({ login: TwitchLoginSchema })
export const SetChannelEnabledPayload = v.object({ login: TwitchLoginSchema, enabled: v.boolean() })
export const SetSystemPayload = v.partial(SystemConfigSchema)
