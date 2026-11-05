import * as v from 'valibot'

// Formato das mensagens WebSocket do pokeidle.io (descoberto no spike S4).
// Tolerante de propósito: campos novos são ignorados e um campo com tipo inesperado
// vira `undefined` em vez de descartar a mensagem inteira.

const lenient = <T extends v.GenericSchema>(schema: T) => v.fallback(v.optional(schema), undefined)

const PokemonSchema = v.looseObject({
  nome: v.string(),
  level: lenient(v.number()),
  shiny: lenient(v.boolean()),
  quality: lenient(v.number()),
  potencia: lenient(v.number()),
  ivs: lenient(v.record(v.string(), v.number())),
})

const DropSchema = v.looseObject({
  nome: v.string(),
  qtd: v.fallback(v.number(), 1),
})

export const BattleEventSchema = v.variant('k', [
  v.looseObject({
    k: v.literal('morte'),
    nome: lenient(v.string()),
    drops: v.fallback(v.array(DropSchema), []),
  }),
  v.looseObject({
    k: v.literal('capturado'),
    pokemon: PokemonSchema,
  }),
  v.looseObject({
    k: v.literal('fugiu'),
    nome: v.string(),
    level: lenient(v.number()),
    shiny: v.fallback(v.boolean(), false),
  }),
  v.looseObject({
    k: v.literal('spawn'),
    nome: v.string(),
    level: lenient(v.number()),
    looktype: lenient(v.number()),
  }),
])
export type BattleEvent = v.InferOutput<typeof BattleEventSchema>

const BonusSchema = v.record(v.string(), v.number())
const RewardSchema = v.looseObject({ tipo: v.string(), titulo: lenient(v.string()), custo: v.number() })

/** Bloco `kick` do estado: vínculo, bônus, recompensas e lista oficial. */
const KickSchema = v.looseObject({
  login: lenient(v.nullable(v.string())),
  vinculado: lenient(v.boolean()),
  /** horário (ms) em que cada bônus acaba; 0 = sem bônus (S6) */
  bonus: lenient(BonusSchema),
  pct: lenient(v.number()),
  minutos: lenient(v.number()),
  recompensas: lenient(v.array(RewardSchema)),
  /** resgates de N horas de uma vez, pelo preço da hora × N, sem desconto */
  pacotes: lenient(v.array(v.number())),
  oficiais: lenient(
    v.array(
      v.looseObject({
        slug: v.string(),
        nome: lenient(v.string()),
        aoVivo: lenient(v.boolean()),
        espectadores: lenient(v.number()),
        /** o canal tem as recompensas do jogo ("pontos ativos") */
        ativo: lenient(v.boolean()),
      }),
    ),
  ),
})
export type KickInfo = v.InferOutput<typeof KickSchema>

/** `estado` chega em pedaços: só os campos que mudaram. Ausente = sem mudança. */
export const EstadoSchema = v.looseObject({
  nick: lenient(v.string()),
  level: lenient(v.number()),
  huntSlug: lenient(v.nullable(v.string())),
  balls: lenient(v.record(v.string(), v.number())),
  automation: lenient(v.looseObject({ ballIds: lenient(v.array(v.number())) })),
  noCentro: lenient(v.boolean()),
  centroMotivo: lenient(v.nullable(v.string())),
  kick: lenient(KickSchema),
})
export type Estado = v.InferOutput<typeof EstadoSchema>

export type GameMessage =
  | { t: 'batalha'; ev: BattleEvent[] }
  | { t: 'estado'; estado: Estado }
  | { t: 'outro'; tipo: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Converte uma mensagem crua do WebSocket. `null` = não é uma mensagem do jogo. */
export function decode(raw: string): GameMessage | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(json) || typeof json.t !== 'string') return null

  if (json.t === 'batalha' && Array.isArray(json.ev)) {
    const ev = json.ev.flatMap((item) => {
      const result = v.safeParse(BattleEventSchema, item)
      return result.success ? [result.output] : []
    })
    return { t: 'batalha', ev }
  }

  if (json.t === 'estado') {
    const result = v.safeParse(EstadoSchema, json.estado)
    if (result.success) return { t: 'estado', estado: result.output }
  }

  return { t: 'outro', tipo: json.t }
}
