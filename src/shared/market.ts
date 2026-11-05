export type Currency = 'gold' | 'orb'

/** Faixa de preços: `p25` = vender rápido, `median` = preço justo, `p75` = esperar. */
export type PriceStats = { count: number; min: number; p25: number; median: number; p75: number; max: number }

/** Uma venda de pokémon, de qualquer jogador. Campos da ficha podem faltar. */
export type Sale = {
  at: number
  name: string
  shiny: boolean
  currency: Currency
  price: number
  level?: number
  nota?: number
  iv?: number
  potencia?: number
  quality?: number
  seller?: string
  buyer?: string
}

/** Um anúncio visto no Mercado, comparado com as vendas de espécie + shiny. */
export type ListingRow = {
  id: number
  name: string
  shiny: boolean
  level?: number
  nota?: number
  iv?: number
  potencia?: number
  quality?: number
  price: number
  currency: Currency
  seller?: string
  /** `null` = menos de 3 vendas conhecidas */
  verdict: { median: number; count: number; diffPct: number; /** mediana convertida da outra moeda */ converted: boolean } | null
}

export type MarketState = {
  /** vendas de pokémon guardadas no PC */
  salesCount: number
  oldestSaleAt?: number
  /** ouro por gema, estimado pelos itens vendidos nas duas moedas */
  goldPerGem?: number
  /** última página de anúncios vista em algum slot */
  listings?: { slot: string; at: number; rows: ListingRow[] }
  lastExportAt?: number
  nextExportAt?: number
  /** por que a exportação diária não está rodando */
  exportProblem?: string
  /** alt usada para os pedidos ao jogo; `null` = nenhuma disponível (a main nunca é usada) */
  alt: string | null
}

export type QuoteRequest = { name: string; shiny: boolean; nota?: number }

export type CurrencyQuote = {
  currency: Currency
  all: PriceStats
  /** vendas com nota parecida (±0,5), quando há pelo menos 3 */
  similar?: PriceStats
  /** líquido de vender pelo preço justo, depois da comissão */
  netAtMedian: number
  /** preço justo convertido para a outra moeda, pela cotação */
  converted?: number
  highest: Sale
  lowest: Sale
}

export type Quote = {
  name: string
  shiny: boolean
  quotes: CurrencyQuote[]
  /** mais recentes primeiro */
  recent: Sale[]
  goldPerGem?: number
}

export type ConsultResult = { quote: Quote; added: number; error?: string }
