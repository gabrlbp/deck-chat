import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Sale } from '../src/shared/market'
import { SalesStore } from '../src/main/market/SalesStore'
import { listingsFromVitrine, salesFromCsv, salesFromHistory } from '../src/main/market/messages'
import { diffPct, goldPerGem, netOfSale, priceStats } from '../src/main/market/stats'
import { parsePokemonText } from '../src/shared/pokemonText'

const AERODACTYL_TELA = `Mega Aerodactyl

×
Mega Aerodactyl+2
Nv 1.437
ROCK
FLYING
AoE

Potência
P3
qualidade
1,800
IV somado
124/192
Poder no PvE
 7,2 mi
Ranking: 6.376
HP de combate
41.772
Poder no PvP
 50.781
conta como Nv 415

Calcular pokemon
Comparar com A
Comparar com B
Reduzir o nível

Ver a ficha da espécie

Copiar p/ ChatGPT
4,004
/ 10,0
Bom
Stats atuais
HP
ATK`

const DUGTRIO_TELA = `Dugtrio
×
✨ Shiny Dugtrio
Nv 712
GROUND
✨ SHINY
🗡️
Potência
P1
qualidade
1,561
IV somado
113/192
Poder no PvE
⚔ 2,3 mi

Copiar p/ ChatGPT
6,546
/ 10,0
Poderoso`

const AERODACTYL_CHATGPT = `# Mega Aerodactyl — ficha do PokeIdle

Ficha de um pokemon do PokeIdle.

## O pokemon

- Espécie: Mega Aerodactyl (#3142) — ROCK / FLYING
- Shiny: não
- Nível: 1,442
- Potência: P3 (+10% em todos os stats)
- Qualidade: 1.8 (melhor que 100% dos nascimentos)
- IV somado: 124 de 192
- Nota da Calculadora: 4.004 de 10 (Bom)
- Poder (⚔): 6,398`

describe('Mercado: texto da ficha', () => {
  it('lê o texto da tela', () => {
    expect(parsePokemonText(AERODACTYL_TELA)).toEqual({
      name: 'Mega Aerodactyl',
      shiny: false,
      level: 1437,
      potencia: 3,
      quality: 1.8,
      iv: 124,
      nota: 4.004,
    })
  })

  it('reconhece o shiny na tela', () => {
    expect(parsePokemonText(DUGTRIO_TELA)).toEqual({
      name: 'Dugtrio',
      shiny: true,
      level: 712,
      potencia: 1,
      quality: 1.561,
      iv: 113,
      nota: 6.546,
    })
  })

  it('lê o "Copiar p/ ChatGPT"', () => {
    expect(parsePokemonText(AERODACTYL_CHATGPT)).toEqual({
      name: 'Mega Aerodactyl',
      shiny: false,
      level: 1442,
      potencia: 3,
      quality: 1.8,
      iv: 124,
      nota: 4.004,
    })
    expect(parsePokemonText(AERODACTYL_CHATGPT.replace('Shiny: não', 'Shiny: sim'))?.shiny).toBe(true)
  })

  it('texto qualquer não é reconhecido', () => {
    expect(parsePokemonText('oi, tudo bem?')).toBeNull()
  })
})

describe('Mercado: preços', () => {
  it('faixa de preços das vendas reais de Infernape shiny (S7)', () => {
    const stats = priceStats([13000, 12000, 17000, 4000, 7500, 9500, 3000, 3600, 4000, 3000])
    expect(stats).toMatchObject({ count: 10, min: 3000, median: 5750, max: 17000 })
    expect(stats?.p25).toBe(3700)
    expect(stats?.p75).toBe(11375)
    expect(priceStats([])).toBeNull()
  })

  it('compara com a referência', () => {
    expect(diffPct(8000, 5750)).toBe(39)
    expect(diffPct(4000, 5000)).toBe(-20)
  })

  it('comissão confere com vendas reais do extrato (S7)', () => {
    expect(netOfSale(15, 'orb')).toBe(13)
    expect(netOfSale(8, 'orb')).toBe(6)
    expect(netOfSale(30_000_000, 'gold')).toBe(25_500_000)
  })

  it('comissão em gema é progressiva', () => {
    // 13% de 500 + 10% de 4500 = 515
    expect(netOfSale(5000, 'orb')).toBe(4485)
    // 515 + 7,5% de 5000 = 890
    expect(netOfSale(10_000, 'orb')).toBe(9110)
    expect(netOfSale(0, 'orb')).toBe(0)
  })

  it('cotação usa só itens caros em gema, com as médias reais do S7', () => {
    const averages = {
      70000: { orb: { media: 4, unidades: 399701 }, gold: { media: 16301820, unidades: 112217 } },
      70011: { orb: { media: 193, unidades: 5273 }, gold: { media: 721817000, unidades: 714 } },
      70012: { orb: { media: 79, unidades: 5252 }, gold: { media: 328160253, unidades: 1003 } },
      70013: { orb: { media: 136, unidades: 4850 }, gold: { media: 556890765, unidades: 756 } },
      70014: { orb: { media: 51, unidades: 5178 }, gold: { media: 267280713, unidades: 616 } },
      40530: { orb: { media: 293, unidades: 3424 }, gold: { media: 1370609673, unidades: 142 } },
      142: { orb: { media: 7, unidades: 2819 }, gold: { media: 129529, unidades: 307525 } },
    }
    const rate = goldPerGem(averages) ?? 0
    expect(rate).toBeGreaterThan(4_000_000)
    expect(rate).toBeLessThan(4_700_000)
    expect(goldPerGem({ 142: averages[142] })).toBeUndefined()
  })
})

describe('Mercado: mensagens do jogo', () => {
  const ficha = { nome: 'Furious Pidgeot', shiny: false, level: 100, nota: 3.824, ivTotal: 124, potencia: 3, quality: 1.767 }

  it('venda da Tabela de preços', () => {
    const linhas = [
      { id: 1, descricao: '1× Fire Stone', tipo: 'item', moeda: 'gold', bruto: 81199, em: 5, ficha: null },
      { id: 2, tipo: 'pokemon', moeda: 'orb', bruto: 12, vendedor: 'a', comprador: 'b', em: 1793808720973, ficha },
    ]
    expect(salesFromHistory(linhas)).toEqual([
      {
        at: 1793808720973,
        name: 'Furious Pidgeot',
        shiny: false,
        currency: 'orb',
        price: 12,
        level: 100,
        nota: 3.824,
        iv: 124,
        potencia: 3,
        quality: 1.767,
        seller: 'a',
        buyer: 'b',
      },
    ])
  })

  it('linha da planilha real: a espécie sai da descrição', () => {
    const row = [1793788799327, 'pokemon', 'Infernape Nv 2441', 1, 'orb', 13000, 'braaasj', 'Starboy', [2441, 1, 6.591, 139, 1, 1.341]]
    expect(salesFromCsv([row, [1, 'item', '38× Leaf Stone', 38, 'gold', 5]])).toEqual([
      {
        at: 1793788799327,
        name: 'Infernape',
        shiny: true,
        currency: 'orb',
        price: 13000,
        level: 2441,
        nota: 6.591,
        iv: 139,
        potencia: 1,
        quality: 1.341,
        seller: 'braaasj',
        buyer: 'Starboy',
      },
    ])
  })

  it('anúncio da vitrine, ignorando o que não reconhece', () => {
    const rows = listingsFromVitrine([{ id: 9, tipo: 'pokemon', preco: 40, moeda: 'orb', vendedor: 'x', ficha }, { tipo: 'item' }, 'lixo'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 9, name: 'Furious Pidgeot', price: 40, currency: 'orb', seller: 'x' })
    expect(listingsFromVitrine(null)).toEqual([])
  })
})

describe('Mercado: histórico local', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-market-'))
  const file = join(dir, 'market', 'sales.jsonl')
  const day = 24 * 60 * 60_000
  const now = 40 * day
  const sale = (at: number, price: number, extra: Partial<Sale> = {}): Sale => ({
    at,
    name: 'Infernape',
    shiny: true,
    currency: 'orb',
    price,
    nota: 6.5,
    ...extra,
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('não guarda a mesma venda duas vezes, venha da planilha ou da Tabela de preços', () => {
    const store = new SalesStore(file)
    expect(store.add([sale(now, 100), sale(now, 100), sale(now - 1000, 200)])).toBe(2)
    expect(store.add([sale(now, 100)])).toBe(0)
    expect(store.count).toBe(2)
    expect(store.pricesOf('INFERNAPE', true, 'orb')).toEqual([100, 200])
    expect(store.pricesOf('Infernape', false, 'orb')).toEqual([])
    expect(store.pricesOf('Infernape', true, 'gold')).toEqual([])
  })

  it('reabre do disco, lê a ficha e apaga o que passou de 30 dias', async () => {
    const first = new SalesStore(file)
    await first.load(now)
    first.add([sale(now - 31 * day, 999, { name: 'Antigo' })])

    const store = new SalesStore(file)
    await store.load(now)
    expect(store.count).toBe(2)
    expect(store.speciesNames()).toEqual(['Infernape'])
    const sales = await store.read('infernape', true)
    expect(sales.map((s) => s.price)).toEqual([100, 200])
    expect(sales[0]).toEqual(sale(now, 100))
    expect(readFileSync(file, 'utf8')).not.toContain('Antigo')
  })

  it('ignora linha cortada no fim do arquivo', async () => {
    appendFileSync(file, '[123,"Corta')
    const store = new SalesStore(file)
    await store.load(now)
    expect(store.count).toBe(2)
  })
})
