import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConsultResult, Currency, CurrencyQuote, ListingRow, MarketState, Quote, QuoteRequest, Sale } from '../../shared/market'
import type { SlotId } from '../../shared/schemas'
import { log } from '../logger'
import { listingsFromVitrine, salesFromCsv, salesFromHistory, type Listing } from './messages'
import { SalesStore } from './SalesStore'
import { diffPct, goldPerGem, MIN_SALES, netOfSale, priceStats } from './stats'

const FIRST_CHECK_MS = 5 * 60_000
const CHECK_EVERY_MS = 5 * 60_000
const EXPORT_EVERY_MS = 24 * 60 * 60_000
/** o servidor limita a 1 planilha por hora por IP; sem resposta ou sem alt, tenta de novo depois disso */
const EXPORT_RETRY_MS = 60 * 60_000
const REPLY_TIMEOUT_MS = 20_000
/** a resposta da consulta volta com este `seq`, que a página descarta por não ser o dela */
const OUR_SEQ = -1
const CONSULT_PAGES = 3
const PAGE_GAP_MS = 1_200
const CONSULT_MIN_GAP_MS = 3_000
const SIMILAR_NOTA = 0.5
const RECENT_ROWS = 30

type Meta = { lastExportAt?: number; nextExportAt?: number; goldPerGem?: number }

type Deps = {
  dataDir: string
  /** alt logada para os pedidos ao jogo; a main nunca é usada */
  alt: () => SlotId | null
  /** manda uma mensagem pela conexão do slot */
  send: (slot: SlotId, message: Record<string, unknown>) => Promise<boolean>
  /** a página baixa a planilha ao receber a resposta: nesse caso, o arquivo não interessa */
  ignoreNextDownload: (slot: SlotId) => void
  onChange: () => void
}

type Waiter = { resolve: (msg: Record<string, unknown> | null) => void; timer: NodeJS.Timeout }

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Comparador e calculadora de preços (F11). Lê o que os slots recebem do Mercado e monta um histórico local.
 * Só pede algo ao jogo em dois casos: a planilha 1x por dia e a consulta de uma espécie quando você clica,
 * sempre por uma alt.
 */
export class MarketService {
  private readonly store: SalesStore
  private readonly metaFile: string
  private readonly deps: Deps
  private meta: Meta = {}
  private listings?: { slot: string; at: number; rows: Listing[] }
  private exportProblem?: string
  private exporting = false
  private exportWaiter: Waiter | null = null
  private consultWaiter: Waiter | null = null
  private lastConsultAt = 0

  constructor(deps: Deps) {
    this.deps = deps
    this.store = new SalesStore(join(deps.dataDir, 'market', 'sales.jsonl'))
    this.metaFile = join(deps.dataDir, 'market', 'meta.json')
  }

  async start(): Promise<void> {
    if (existsSync(this.metaFile)) {
      try {
        this.meta = JSON.parse(readFileSync(this.metaFile, 'utf8')) as Meta
      } catch {
        this.meta = {}
      }
    }
    await this.store.load(Date.now())
    log(`[mercado] ${this.store.count} vendas no histórico local`)
    this.deps.onChange()
    setTimeout(() => {
      void this.checkExport()
      setInterval(() => void this.checkExport(), CHECK_EVERY_MS)
    }, FIRST_CHECK_MS)
  }

  state(): MarketState {
    const listings = this.listings
    return {
      salesCount: this.store.count,
      oldestSaleAt: this.store.oldestAt,
      goldPerGem: this.meta.goldPerGem,
      listings: listings && { slot: listings.slot, at: listings.at, rows: listings.rows.map((r) => this.withVerdict(r)) },
      lastExportAt: this.meta.lastExportAt,
      nextExportAt: this.meta.nextExportAt,
      exportProblem: this.exportProblem,
      alt: this.deps.alt(),
    }
  }

  speciesNames(): string[] {
    return this.store.speciesNames()
  }

  /** Mensagem do Mercado recebida por um slot, venha de quem vier: navegar pelo jogo também alimenta o histórico. */
  onMessage(slot: SlotId, msg: Record<string, unknown>): void {
    if (msg['t'] === 'csv' && msg['tipo'] === 'mercado') return this.onCsv(msg)
    if (msg['t'] !== 'market') return

    const aba = msg['aba']
    if (aba === 'vitrine') {
      const rows = listingsFromVitrine(msg['linhas'])
      if (rows.length) this.listings = { slot, at: Date.now(), rows }
    } else if (aba === 'historicoGlobal') {
      const added = this.store.add(salesFromHistory(msg['linhas']))
      if (added) log(`[mercado] +${added} vendas da Tabela de preços (${slot})`)
      if (msg['seq'] === OUR_SEQ) this.settle('consult', msg)
    } else if (aba === 'itens' || aba === 'medias') {
      const rate = goldPerGem((msg['medias'] ?? {}) as Parameters<typeof goldPerGem>[0])
      if (rate) this.saveMeta({ goldPerGem: rate })
    } else {
      return
    }
    this.deps.onChange()
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    const sales = await this.store.read(req.name, req.shiny)
    const rate = this.meta.goldPerGem
    const quotes = (['orb', 'gold'] as Currency[]).flatMap((currency) => {
      const quote = this.currencyQuote(sales.filter((s) => s.currency === currency), currency, req.nota, rate)
      return quote ? [quote] : []
    })
    return { name: req.name, shiny: req.shiny, quotes, recent: sales.slice(0, RECENT_ROWS), goldPerGem: rate }
  }

  /** Pede ao jogo as vendas da espécie (até 3 páginas de 30), para a calculadora. Só quando você clica. */
  async consult(req: QuoteRequest): Promise<ConsultResult> {
    const before = this.store.count
    const finish = async (error?: string): Promise<ConsultResult> => {
      this.deps.onChange()
      return { quote: await this.quote(req), added: this.store.count - before, error }
    }
    const alt = this.deps.alt()
    if (!alt) return finish('nenhuma alt logada para consultar (a main não é usada)')
    if (this.consultWaiter || Date.now() - this.lastConsultAt < CONSULT_MIN_GAP_MS) return finish('aguarde alguns segundos entre as consultas')
    this.lastConsultAt = Date.now()

    for (let pagina = 0; pagina < CONSULT_PAGES; pagina++) {
      if (pagina > 0) await delay(PAGE_GAP_MS)
      const reply = this.waitFor('consult')
      const sent = await this.deps.send(alt, {
        t: 'market.historicoGlobal',
        pagina,
        seq: OUR_SEQ,
        tipo: 'pokemon',
        busca: req.name.toLowerCase(),
        ...(req.shiny ? { soShiny: 1 } : {}),
      })
      if (!sent) {
        this.settle('consult', null)
        return finish('não foi possível enviar o pedido pela alt')
      }
      const msg = await reply
      if (!msg) return finish('o jogo não respondeu à consulta')
      if (msg['temMais'] !== true) break
    }
    log(`[mercado] consulta de ${req.name}${req.shiny ? ' shiny' : ''} por ${alt}: +${this.store.count - before} vendas`)
    return finish()
  }

  private withVerdict(row: Listing): ListingRow {
    const compare = (currency: Currency, factor: number, converted: boolean) => {
      const stats = priceStats(this.store.pricesOf(row.name, row.shiny, currency))
      if (!stats || stats.count < MIN_SALES) return null
      const median = stats.median * factor
      return { median, count: stats.count, diffPct: diffPct(row.price, median), converted }
    }
    const rate = this.meta.goldPerGem
    const other: Currency = row.currency === 'gold' ? 'orb' : 'gold'
    const toRowCurrency = row.currency === 'gold' ? (rate ?? 0) : rate ? 1 / rate : 0
    return { ...row, verdict: compare(row.currency, 1, false) ?? (rate ? compare(other, toRowCurrency, true) : null) }
  }

  private currencyQuote(sales: Sale[], currency: Currency, nota: number | undefined, rate: number | undefined): CurrencyQuote | null {
    const all = priceStats(sales.map((s) => s.price))
    if (!all) return null
    const byPrice = [...sales].sort((a, b) => a.price - b.price)
    const lowest = byPrice[0]
    const highest = byPrice.at(-1)
    if (!lowest || !highest) return null
    const close = nota === undefined ? [] : sales.filter((s) => s.nota !== undefined && Math.abs(s.nota - nota) <= SIMILAR_NOTA)
    const reference = close.length >= MIN_SALES ? (priceStats(close.map((s) => s.price)) ?? all) : all
    return {
      currency,
      all,
      similar: close.length >= MIN_SALES ? reference : undefined,
      netAtMedian: netOfSale(reference.median, currency),
      converted: rate ? (currency === 'gold' ? reference.median / rate : reference.median * rate) : undefined,
      highest,
      lowest,
    }
  }

  private async checkExport(): Promise<void> {
    const now = Date.now()
    if (this.exporting || now < (this.meta.nextExportAt ?? 0)) return
    const alt = this.deps.alt()
    if (!alt) {
      this.exportProblem = 'nenhuma alt logada (a main não é usada)'
      this.deps.onChange()
      return
    }
    this.exporting = true
    try {
      log(`[mercado] pedindo a planilha diária por ${alt}`)
      const reply = this.waitFor('export')
      this.deps.ignoreNextDownload(alt)
      const sent = await this.deps.send(alt, { filtros: { tipo: 'pokemon' }, t: 'csv.pedir', tipo: 'mercado' })
      // também a cotação, das médias de 7 dias dos itens
      if (sent) await this.deps.send(alt, { t: 'market.medias' })
      if (!sent) this.settle('export', null)
      if (!(await reply)) {
        this.exportProblem = sent ? 'o jogo não respondeu ao pedido da planilha' : 'não foi possível enviar o pedido pela alt'
        this.saveMeta({ nextExportAt: now + EXPORT_RETRY_MS })
      }
      // a resposta recusada ou aceita já foi tratada em onCsv
      await this.store.load(Date.now())
    } finally {
      this.exporting = false
      this.deps.onChange()
    }
  }

  /** Resposta da planilha: pedida pelo app ou pelo seu clique em "Exportar planilha". */
  private onCsv(msg: Record<string, unknown>): void {
    const now = Date.now()
    const ours = this.exportWaiter !== null
    const refusal = msg['recusa'] as { restaMs?: unknown } | undefined
    if (refusal) {
      // normalmente alguém já exportou nesta hora, neste IP
      const wait = typeof refusal.restaMs === 'number' ? refusal.restaMs : EXPORT_RETRY_MS
      if (ours) {
        log(`[mercado] planilha recusada pelo jogo, nova tentativa em ${Math.round(wait / 60_000)} min`)
        this.saveMeta({ nextExportAt: now + wait + 60_000 })
      }
    } else if (msg['ok'] === true) {
      const data = msg['mercado'] as { linhas?: unknown; cortado?: unknown } | undefined
      const added = this.store.add(salesFromCsv(data?.linhas))
      log(`[mercado] planilha recebida: +${added} vendas novas (${this.store.count} no total)`)
      if (ours) {
        this.exportProblem = undefined
        this.saveMeta({ lastExportAt: now, nextExportAt: now + EXPORT_EVERY_MS })
      }
    }
    this.settle('export', msg)
    this.deps.onChange()
  }

  private waitFor(kind: 'export' | 'consult'): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(kind, null), REPLY_TIMEOUT_MS)
      const waiter = { resolve, timer }
      if (kind === 'export') this.exportWaiter = waiter
      else this.consultWaiter = waiter
    })
  }

  private settle(kind: 'export' | 'consult', msg: Record<string, unknown> | null): void {
    const waiter = kind === 'export' ? this.exportWaiter : this.consultWaiter
    if (!waiter) return
    clearTimeout(waiter.timer)
    if (kind === 'export') this.exportWaiter = null
    else this.consultWaiter = null
    waiter.resolve(msg)
  }

  private saveMeta(patch: Meta): void {
    this.meta = { ...this.meta, ...patch }
    writeFileSync(this.metaFile, JSON.stringify(this.meta))
  }
}
