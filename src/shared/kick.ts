/**
 * Spike S6: fases do teste de pontos da Kick. Cada fase mede pontos/h e memória de uma configuração.
 * Ver docs/PRD.md (S6) e spikes/s6-kick/README.md.
 */
export const KICK_PHASES = {
  off: { label: 'Parado', lives: 0, page: 'live', video: true, window: 'hidden' },
  K1: { label: 'K1 · 2 lives com vídeo (160p), escondidas', lives: 2, page: 'live', video: true, window: 'hidden' },
  K2: { label: 'K2 · 2 lives sem vídeo, escondidas', lives: 2, page: 'live', video: false, window: 'hidden' },
  K3a: { label: 'K3 · 4 lives com vídeo (160p), escondidas', lives: 4, page: 'live', video: true, window: 'hidden' },
  K3b: { label: 'K3 · 4 lives sem vídeo, escondidas', lives: 4, page: 'live', video: false, window: 'hidden' },
  K4: {
    label: 'K4 · 2 lives com vídeo (160p), janela transparente (plano B)',
    lives: 2,
    page: 'live',
    video: true,
    window: 'transparent',
  },
  K5: { label: 'K5 · só o chat popout de 2 canais (sem player)', lives: 2, page: 'chat', video: false, window: 'hidden' },
} as const satisfies Record<
  string,
  { label: string; lives: number; page: 'live' | 'chat'; video: boolean; window: 'hidden' | 'transparent' }
>

export type KickPhase = keyof typeof KICK_PHASES
export const KICK_PHASE_IDS = Object.keys(KICK_PHASES) as KickPhase[]

export type KickChannelView = {
  slug: string
  nome: string
  /** do jogo (`kick.oficiais`), confirmado pela API para as lives abertas */
  live: boolean | null
  viewers?: number
  watching: boolean
  /** saldo de pontos do canal; `null` = ainda não lido ou sem login */
  points: number | null
  /** pontos ganhos desde o início da fase (gastos não contam) */
  gained: number
  /** desde quando está aberta nesta fase */
  watchingSince?: number
  /** estado do player, para diagnóstico: "tocando 160p", "pausado", "sem vídeo"… */
  video?: string
  memoryMb?: number
}

export type KickGameView = {
  slot: string
  vinculado?: boolean
  login?: string | null
  /** como o jogo manda (formato a descobrir no S6) */
  bonus?: Record<string, unknown>
}

export type KickState = {
  login: 'unknown' | 'logged-out' | 'logged-in'
  /** janela de login aberta */
  loggingIn: boolean
  phase: KickPhase
  phaseStartedAt?: number
  channels: KickChannelView[]
  /** de cada slot que recebeu o bloco `kick` do jogo */
  game: KickGameView[]
  /** última leitura de pontos */
  polledAt?: number
  problem?: string
}
