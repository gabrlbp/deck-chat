import type { Currency, PriceStats } from '../../shared/market'

/** Com menos vendas que isso, a tela não afirma se está caro ou barato. */
export const MIN_SALES = 3

/** Quantil com interpolação; `sorted` em ordem crescente e não vazio. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const low = Math.floor(pos)
  const high = Math.ceil(pos)
  const a = sorted[low] ?? 0
  const b = sorted[high] ?? a
  return a + (b - a) * (pos - low)
}

export function priceStats(prices: number[]): PriceStats | null {
  if (prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a - b)
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted.at(-1) ?? 0,
  }
}

/** Quanto o preço está acima (+) ou abaixo (−) da referência, em %. */
export const diffPct = (price: number, reference: number): number => Math.round((price / reference - 1) * 100)

/** Faixas de comissão do pokémon em gema (`shared/taxa-mercado.mjs` do jogo): progressivas, como imposto de renda. */
const ORB_BRACKETS = [
  { upTo: 500, basisPoints: 1300 },
  { upTo: 5000, basisPoints: 1000 },
  { upTo: Infinity, basisPoints: 750 },
]

/** O que o vendedor recebe de um pokémon vendido por `total`. */
export function netOfSale(total: number, currency: Currency): number {
  const t = Math.floor(total)
  if (t <= 0) return 0
  if (currency === 'gold') return t - Math.min(t, Math.ceil(t * 0.15))
  let floor = 0
  let basisPoints = 0
  for (const bracket of ORB_BRACKETS) {
    const ceiling = Math.min(t, bracket.upTo)
    if (ceiling <= floor) break
    basisPoints += (ceiling - floor) * bracket.basisPoints
    floor = ceiling
  }
  return t - Math.min(t, Math.ceil(basisPoints / 10_000))
}

type ItemAverages = Record<string, { orb?: { media?: number; unidades?: number }; gold?: { media?: number; unidades?: number } }>

/**
 * Ouro por gema, pelos itens vendidos nas duas moedas. Só itens caros em gema: nos baratos o arredondamento
 * distorce (4 gemas pode ser 3,5 ou 4,5) e o preço mínimo do NPC derruba a conta (ex.: 7 gemas × 129 mil de ouro).
 */
export function goldPerGem(averages: ItemAverages): number | undefined {
  const rates = Object.values(averages).flatMap(({ orb, gold }) =>
    orb?.media && gold?.media && orb.media >= 50 && (orb.unidades ?? 0) >= 100 && (gold.unidades ?? 0) >= 100
      ? [gold.media / orb.media]
      : [],
  )
  return rates.length >= 3 ? priceStats(rates)?.median : undefined
}
