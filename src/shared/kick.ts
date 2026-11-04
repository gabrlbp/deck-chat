import type { BonusType, KickConfig } from './schemas'

export type KickReward = { tipo: BonusType; titulo: string; custo: number }

export type KickChannelView = {
  slug: string
  nome: string
  live: boolean
  viewers?: number
  /** live aberta agora */
  watching: boolean
  /** saldo de pontos do canal; `null` = ainda não lido */
  points: number | null
  /** ganhos nesta sessão do app (gastos não contam) */
  gained: number
  watchingSince?: number
  /** ficou aberta sem ganhar pontos e espera até este horário para voltar */
  coolingUntil?: number
  /** estado do player, para diagnóstico */
  video?: string
  memoryMb?: number
}

export type KickState = {
  login: 'unknown' | 'logged-out' | 'logged-in'
  loggingIn: boolean
  config: KickConfig
  /** conta da Kick vinculada no jogo, lida do slot da main; `null` = nenhum slot com vínculo */
  linked: { slot: string; login: string | null } | null
  /** horário (ms) em que cada bônus acaba */
  bonus: Partial<Record<BonusType, number>>
  rewards: KickReward[]
  /** bônus que o resgate automático está mirando */
  target: BonusType | null
  channels: KickChannelView[]
  gainedTotal: number
  polledAt?: number
  problem?: string
  /** por que o resgate automático parou (mudar a opção de resgate libera de novo) */
  redeemBlocked?: string
}
