import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Currency, Sale } from '../../shared/market'

const RETENTION_MS = 30 * 24 * 60 * 60_000

export const saleKey = (name: string, shiny: boolean) => `${name.toLowerCase()}|${shiny ? 1 : 0}`

/** Uma linha do arquivo: lista em vez de objeto, para o histórico de 30 dias ficar em poucos MB. */
type Row = [number, string, 0 | 1, 'g' | 'o', number, number?, number?, number?, number?, number?, string?, string?]

const toRow = (s: Sale): Row => [
  s.at,
  s.name,
  s.shiny ? 1 : 0,
  s.currency === 'gold' ? 'g' : 'o',
  s.price,
  s.level,
  s.nota,
  s.iv,
  s.potencia,
  s.quality,
  s.seller,
  s.buyer,
]

const fromRow = (r: Row): Sale => ({
  at: r[0],
  name: r[1],
  shiny: r[2] === 1,
  currency: r[3] === 'g' ? 'gold' : 'orb',
  price: r[4],
  // JSON troca `undefined` por `null` nas listas
  level: r[5] ?? undefined,
  nota: r[6] ?? undefined,
  iv: r[7] ?? undefined,
  potencia: r[8] ?? undefined,
  quality: r[9] ?? undefined,
  seller: r[10] ?? undefined,
  buyer: r[11] ?? undefined,
})

function parseRows(text: string): Row[] {
  return text.split('\n').flatMap((line) => {
    if (!line) return []
    try {
      return [JSON.parse(line) as Row]
    } catch {
      return [] // linha cortada por uma queda de energia, por exemplo
    }
  })
}

/**
 * Histórico local de vendas de pokémon, num arquivo no PC. Em memória fica só o necessário para comparar
 * anúncios (os preços por espécie + shiny); a ficha de cada venda é lida do disco quando a calculadora pede.
 */
export class SalesStore {
  private readonly file: string
  private readonly seen = new Set<string>()
  private readonly prices = new Map<string, { gold: number[]; orb: number[] }>()
  private readonly names = new Set<string>()
  private oldest?: number

  constructor(file: string) {
    this.file = file
    mkdirSync(dirname(file), { recursive: true })
  }

  get count(): number {
    return this.seen.size
  }

  get oldestAt(): number | undefined {
    return this.oldest
  }

  speciesNames(): string[] {
    return [...this.names].sort((a, b) => a.localeCompare(b))
  }

  pricesOf(name: string, shiny: boolean, currency: Currency): number[] {
    return this.prices.get(saleKey(name, shiny))?.[currency] ?? []
  }

  /** Carrega o arquivo e apaga o que passou de 30 dias. */
  async load(now: number): Promise<void> {
    this.reset()
    if (!existsSync(this.file)) return
    const rows = parseRows(await readFile(this.file, 'utf8'))
    const kept = rows.filter((r) => now - r[0] <= RETENTION_MS)
    for (const row of kept) this.index(fromRow(row))
    if (kept.length !== rows.length) {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, kept.map((r) => `${JSON.stringify(r)}\n`).join(''))
      renameSync(tmp, this.file)
    }
  }

  /** Guarda as vendas ainda não conhecidas e diz quantas eram novas. */
  add(sales: Sale[]): number {
    const fresh = sales.filter((s) => !this.seen.has(this.id(s)))
    // a mesma venda pode vir repetida dentro do lote
    const unique = [...new Map(fresh.map((s) => [this.id(s), s])).values()]
    if (unique.length === 0) return 0
    appendFileSync(this.file, unique.map((s) => `${JSON.stringify(toRow(s))}\n`).join(''))
    for (const sale of unique) this.index(sale)
    return unique.length
  }

  /** Todas as vendas de espécie + shiny, com a ficha, mais recentes primeiro. */
  async read(name: string, shiny: boolean): Promise<Sale[]> {
    if (!existsSync(this.file)) return []
    const key = saleKey(name, shiny)
    return parseRows(await readFile(this.file, 'utf8'))
      .filter((r) => saleKey(r[1], r[2] === 1) === key)
      .map(fromRow)
      .sort((a, b) => b.at - a.at)
  }

  private id(sale: Sale): string {
    return `${sale.at}:${sale.price}`
  }

  private index(sale: Sale): void {
    this.seen.add(this.id(sale))
    this.names.add(sale.name)
    const key = saleKey(sale.name, sale.shiny)
    const entry = this.prices.get(key) ?? { gold: [], orb: [] }
    entry[sale.currency].push(sale.price)
    this.prices.set(key, entry)
    if (this.oldest === undefined || sale.at < this.oldest) this.oldest = sale.at
  }

  private reset(): void {
    this.seen.clear()
    this.prices.clear()
    this.names.clear()
    this.oldest = undefined
  }
}
