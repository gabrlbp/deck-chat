export type FarmChannel = {
  slug: string
  live: boolean
  /** saldo do canal; `null` = ainda não lido, conta como 0 */
  points: number | null
  /** ficou aberta sem ganhar pontos: espera um tempo antes de voltar */
  cooling: boolean
}

/** Trocar de live perde até ~7 min até a primeira contagem (S6): só troca se a diferença compensa. */
export const SWITCH_MARGIN = 50

const TIERS = [300, 500, 1000]

/**
 * Quanto falta para a próxima meta do canal.
 * Com bônus-alvo, a meta é o custo dele. Só avisando, são os custos dos bônus e, depois, cada milhar.
 */
export function pointsLeft(points: number | null, goalCost: number | null): number {
  const p = points ?? 0
  if (goalCost !== null) return Math.max(0, goalCost - p)
  const next = TIERS.find((tier) => p < tier) ?? (Math.floor(p / 1000) + 1) * 1000
  return next - p
}

/**
 * Quais lives ficam abertas: as vagas vão para o canal ao vivo mais perto da meta, porque os pontos
 * são separados por canal. Quem já está aberta continua, a não ser que outro canal compense a troca.
 */
export function planLives(channels: FarmChannel[], current: string[], lives: number, goalCost: number | null): string[] {
  const left = (c: FarmChannel) => pointsLeft(c.points, goalCost)
  const available = channels.filter((c) => c.live && !c.cooling)
  const byGoal = [...available].sort((a, b) => left(a) - left(b) || (b.points ?? 0) - (a.points ?? 0))

  const kept = byGoal.filter((c) => current.includes(c.slug)).slice(0, lives)
  const waiting = byGoal.filter((c) => !kept.includes(c))
  while (kept.length < lives && waiting.length) kept.push(waiting.shift() as FarmChannel)

  kept.sort((a, b) => left(a) - left(b))

  // o melhor que está esperando contra o pior que está aberto
  for (const candidate of waiting) {
    const worst = kept.at(-1)
    if (!worst || left(candidate) + SWITCH_MARGIN >= left(worst)) break
    kept[kept.length - 1] = candidate
    kept.sort((a, b) => left(a) - left(b))
  }
  return kept.map((c) => c.slug)
}
