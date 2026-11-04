import { randomBytes } from 'node:crypto'
import { BONUS_TYPES, type BonusType, type KickConfig } from '../../shared/schemas'

/** freio contra gastar pontos sem parar, caso algo saia errado */
export const MAX_REDEEMS_PER_HOUR = 6
/** se o jogo não creditar nesse tempo, o resgate automático para e avisa (em condições normais: ~8 s) */
export const CONFIRM_TIMEOUT_MS = 5 * 60_000

/**
 * Qual bônus resgatar agora. Em "todos", mira o que tem menos tempo restante. Assim Captura e Shiny
 * também saem: sem mirar, todo canal gastaria em XP assim que chegasse a 300 pontos.
 */
export function pickTarget(config: Pick<KickConfig, 'redeem' | 'redeemType'>, bonus: Partial<Record<BonusType, number>>, now: number): BonusType | null {
  if (config.redeem === 'none') return null
  if (config.redeem === 'one') return config.redeemType
  const remaining = (tipo: BonusType) => Math.max(0, (bonus[tipo] ?? 0) - now)
  return BONUS_TYPES.reduce((best, tipo) => (remaining(tipo) < remaining(best) ? tipo : best))
}

/** O canal que paga: o de menor saldo suficiente, guardando os maiores saldos para os bônus caros. */
export function pickChannel(balances: { slug: string; points: number | null }[], cost: number): string | null {
  const able = balances.filter((b) => (b.points ?? 0) >= cost)
  able.sort((a, b) => (a.points ?? 0) - (b.points ?? 0))
  return able[0]?.slug ?? null
}

export const canRedeem = (history: number[], now: number): boolean =>
  history.filter((at) => now - at < 60 * 60_000).length < MAX_REDEEMS_PER_HOUR

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `transaction_id` do resgate: a página da Kick manda um ULID (48 bits de horário + 80 aleatórios). */
export function ulid(now: number, random: Uint8Array = randomBytes(10)): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time
    t = Math.floor(t / 32)
  }
  let bits = 0n
  for (const byte of random) bits = (bits << 8n) | BigInt(byte)
  let rest = ''
  for (let i = 0; i < 16; i++) {
    rest = CROCKFORD.charAt(Number(bits & 31n)) + rest
    bits >>= 5n
  }
  return time + rest
}
