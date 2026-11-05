import type { Currency, ListingRow, Sale } from '../../shared/market'

// Mensagens do Mercado (formato visto no S7). Tolerante: o que não reconhece fica de fora, sem derrubar o resto.

type Obj = Record<string, unknown>
const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const str = (value: unknown) => (typeof value === 'string' ? value : undefined)
const currency = (value: unknown): Currency | undefined => (value === 'gold' || value === 'orb' ? value : undefined)

/** Campos da ficha do pokémon, iguais nos anúncios e nas vendas. */
function fromSheet(ficha: unknown) {
  if (!isObj(ficha)) return null
  const name = str(ficha['nome'])
  if (!name) return null
  return {
    name,
    shiny: ficha['shiny'] === true,
    level: num(ficha['level']),
    nota: num(ficha['nota']),
    iv: num(ficha['ivTotal']),
    potencia: num(ficha['potencia']),
    quality: num(ficha['quality']),
  }
}

/** Linhas de `market` `aba=historicoGlobal`: só as vendas de pokémon. */
export function salesFromHistory(linhas: unknown): Sale[] {
  if (!Array.isArray(linhas)) return []
  return linhas.flatMap((row: unknown) => {
    if (!isObj(row) || row['tipo'] !== 'pokemon') return []
    const sheet = fromSheet(row['ficha'])
    const at = num(row['em'])
    const price = num(row['bruto'])
    const coin = currency(row['moeda'])
    if (!sheet || at === undefined || price === undefined || !coin) return []
    return [{ ...sheet, at, price, currency: coin, seller: str(row['vendedor']), buyer: str(row['comprador']) }]
  })
}

/** Linhas da planilha: `[data, tipo, descrição, qtd, moeda, bruto, vendedor, comprador, [nível, shiny, nota, iv, potência, qualidade]]`. */
export function salesFromCsv(linhas: unknown): Sale[] {
  if (!Array.isArray(linhas)) return []
  return linhas.flatMap((row: unknown) => {
    if (!Array.isArray(row) || row[1] !== 'pokemon') return []
    const at = num(row[0])
    const description = str(row[2])
    const coin = currency(row[4])
    const price = num(row[5])
    // a planilha não traz a espécie: ela sai da descrição, "Infernape Nv 2441"
    const name = description?.replace(/\s+Nv\s+[\d.,]+$/, '').trim()
    if (at === undefined || !name || !coin || price === undefined) return []
    const extra: unknown[] = Array.isArray(row[8]) ? row[8] : []
    return [
      {
        at,
        name,
        shiny: extra[1] === 1 || extra[1] === true,
        currency: coin,
        price,
        level: num(extra[0]),
        nota: num(extra[2]),
        iv: num(extra[3]),
        potencia: num(extra[4]),
        quality: num(extra[5]),
        seller: str(row[6]),
        buyer: str(row[7]),
      },
    ]
  })
}

export type Listing = Omit<ListingRow, 'verdict'>

/** Linhas de `market` `aba=vitrine`: anúncios de pokémon. */
export function listingsFromVitrine(linhas: unknown): Listing[] {
  if (!Array.isArray(linhas)) return []
  return linhas.flatMap((row: unknown) => {
    if (!isObj(row) || row['tipo'] !== 'pokemon') return []
    const sheet = fromSheet(row['ficha'])
    const id = num(row['id'])
    const price = num(row['preco'])
    const coin = currency(row['moeda'])
    if (!sheet || id === undefined || price === undefined || !coin) return []
    return [{ ...sheet, id, price, currency: coin, seller: str(row['vendedor']) }]
  })
}
