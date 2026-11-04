import type { EventDraft } from './events'
import type { Estado, KickInfo, TwitchInfo } from './messages'

/** Estado conhecido de uma alt, montado a partir dos `estado` parciais. */
export type GameSnapshot = {
  nick?: string
  level?: number
  hunt?: string | null
  balls?: Record<string, number>
  ballIds?: number[]
  noCentro?: boolean
  centroMotivo?: string | null
  /** os blocos chegam inteiros quando mudam */
  kick?: KickInfo
  twitch?: TwitchInfo
}

/** Soma das pokébolas que a automação usa; sem essa info, soma todas. */
export function ballsLeft(s: GameSnapshot): number | undefined {
  if (!s.balls) return undefined
  const ids = s.ballIds?.length ? s.ballIds.map(String) : Object.keys(s.balls)
  return ids.reduce((sum, id) => sum + (s.balls?.[id] ?? 0), 0)
}

export class SlotGame {
  private state: GameSnapshot = {}

  get snapshot(): Readonly<GameSnapshot> {
    return this.state
  }

  /** Outra conta vai logar no slot (sessão limpa). */
  reset(): void {
    this.state = {}
  }

  /** Aplica um `estado` parcial e retorna problemas detectados na transição. */
  apply(estado: Estado): EventDraft[] {
    const prev = this.state
    const next: GameSnapshot = { ...prev }

    if (estado.nick !== undefined) next.nick = estado.nick
    if (estado.level !== undefined) next.level = estado.level
    if (estado.huntSlug !== undefined) next.hunt = estado.huntSlug
    if (estado.balls !== undefined) next.balls = estado.balls
    if (estado.automation?.ballIds !== undefined) next.ballIds = estado.automation.ballIds
    if (estado.noCentro !== undefined) next.noCentro = estado.noCentro
    if (estado.centroMotivo !== undefined) next.centroMotivo = estado.centroMotivo
    if (estado.kick !== undefined) next.kick = { ...prev.kick, ...estado.kick }
    if (estado.twitch !== undefined) next.twitch = { ...prev.twitch, ...estado.twitch }

    this.state = next

    const drafts: EventDraft[] = []
    const ballsBefore = ballsLeft(prev)
    if (ballsBefore !== undefined && ballsBefore > 0 && ballsLeft(next) === 0) {
      drafts.push({ kind: 'problem', title: 'Acabaram as pokébolas', detail: 'a alt não está mais capturando' })
    }
    if (prev.noCentro === false && next.noCentro === true) {
      drafts.push({
        kind: 'problem',
        title: 'Foi para o Centro Pokémon',
        detail: next.centroMotivo ?? undefined,
      })
    }
    return drafts
  }
}
