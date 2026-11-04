/**
 * Spike S8: a Twitch agora dá bônus como a Kick (pontos do canal, com o vídeo rodando na página).
 * Cada fase mede pontos e memória de uma configuração. Ver docs/PRD.md (B3) e spikes/s8-twitch/README.md.
 */
export const TWITCH_PHASES = {
  off: { label: 'Parado', lives: 0, chest: false, window: 'hidden' },
  T1: { label: 'T1 · 2 lives em 160p, escondidas, sem clicar no baú', lives: 2, chest: false, window: 'hidden' },
  T2: { label: 'T2 · 2 lives em 160p, escondidas, clicando no baú', lives: 2, chest: true, window: 'hidden' },
  T3: { label: 'T3 · 4 lives em 160p, escondidas, clicando no baú', lives: 4, chest: true, window: 'hidden' },
  T4: { label: 'T4 · 2 lives em 160p, janela transparente (plano B)', lives: 2, chest: true, window: 'transparent' },
} as const satisfies Record<string, { label: string; lives: number; chest: boolean; window: 'hidden' | 'transparent' }>

export type TwitchPhase = keyof typeof TWITCH_PHASES
export const TWITCH_PHASE_IDS = Object.keys(TWITCH_PHASES) as TwitchPhase[]

export type TwitchChannelView = {
  login: string
  nome: string
  live: boolean
  ativo: boolean
  viewers?: number
  watching: boolean
  /** como a página mostra, ex.: "1,2 mil"; só existe com a live aberta */
  balance?: string
  chests: number
  watchingSince?: number
  video?: string
  memoryMb?: number
}

export type TwitchState = {
  login: 'unknown' | 'logged-out' | 'logged-in'
  loggingIn: boolean
  phase: TwitchPhase
  phaseStartedAt?: number
  channels: TwitchChannelView[]
  /** pontos ganhos na fase, somados das mensagens da página */
  gainedPhase: number
  chestsPhase: number
  /** vínculo e bônus de cada slot que recebeu o bloco `twitch` do jogo */
  game: { slot: string; vinculado?: boolean; login?: string | null; bonus?: Record<string, number> }[]
  polledAt?: number
}
