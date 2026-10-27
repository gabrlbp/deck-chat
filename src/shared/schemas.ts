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

export const ConfigSchema = v.object({
  version: v.literal(1),
  gameUrl: v.pipe(v.string(), v.url()),
  slots: v.pipe(v.array(SlotConfigSchema), v.length(SLOT_IDS.length)),
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
}

// Payloads IPC (renderer → main). O main valida tudo antes de usar.
export const SetBoundsPayload = v.object({ id: SlotIdSchema, bounds: BoundsSchema })
export const SetMutedPayload = v.object({ id: SlotIdSchema, muted: v.boolean() })
export const SetEnabledPayload = v.object({ id: SlotIdSchema, enabled: v.boolean() })
export const SetZoomPayload = v.object({ id: SlotIdSchema, zoom: ZoomSchema })
export const SlotIdPayload = v.object({ id: SlotIdSchema })
export const MarkPayload = v.object({ text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)) })
