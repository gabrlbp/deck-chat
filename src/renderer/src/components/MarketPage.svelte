<script lang="ts">
  import type { Currency, CurrencyQuote, MarketState, PriceStats, Quote, Sale } from '../../../shared/market'
  import { parsePokemonText } from '../../../shared/pokemonText'

  let { market }: { market: MarketState } = $props()

  const format = new Intl.NumberFormat('pt-BR')
  const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const two = (value: number) => decimal.format(value)
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
  const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
  const money = (value: number, currency: Currency) =>
    currency === 'gold' ? `${compact.format(value)} ouro` : `${format.format(Math.round(value))} gemas`
  const CURRENCY_NAME: Record<Currency, string> = { orb: 'Em gemas', gold: 'Em ouro' }

  let pasted = $state('')
  let name = $state('')
  let shiny = $state(false)
  let nota = $state<number | undefined>(undefined)
  let details = $state('')
  let parseFailed = $state(false)
  let names = $state<string[]>([])
  let quote = $state<Quote | null>(null)
  let busy = $state(false)
  let message = $state('')

  $effect(() => {
    void window.deck.market.names().then((list) => (names = list))
  })

  const request = $derived({ name: name.trim(), shiny, ...(nota === undefined ? {} : { nota }) })

  function onPaste() {
    if (!pasted.trim()) {
      parseFailed = false
      return
    }
    const parsed = parsePokemonText(pasted)
    parseFailed = parsed === null
    if (!parsed) return
    name = parsed.name
    shiny = parsed.shiny
    nota = parsed.nota
    details = [
      parsed.level !== undefined ? `Nv ${format.format(parsed.level)}` : '',
      parsed.potencia !== undefined ? `P${parsed.potencia}` : '',
      parsed.iv !== undefined ? `IV ${parsed.iv}` : '',
      parsed.quality !== undefined ? `Q ${two(parsed.quality)}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    void calculate()
  }

  async function calculate() {
    if (!request.name) return
    message = ''
    quote = await window.deck.market.quote($state.snapshot(request))
  }

  async function consult() {
    if (!request.name) return
    busy = true
    message = ''
    const result = await window.deck.market.consult($state.snapshot(request))
    busy = false
    quote = result.quote
    message = result.error ?? `Consulta feita: +${result.added} vendas novas.`
    names = await window.deck.market.names()
  }

  const statsLine = (stats: PriceStats, currency: Currency) => [
    { label: 'Vender rápido', value: money(stats.p25, currency) },
    { label: 'Preço justo', value: money(stats.median, currency), main: true },
    { label: 'Esperar', value: money(stats.p75, currency) },
  ]
  const saleText = (sale: Sale) =>
    `Nv ${sale.level ? format.format(sale.level) : '?'} · P${sale.potencia ?? '?'} · IV ${sale.iv ?? '?'} · Q ${sale.quality === undefined ? '?' : two(sale.quality)} · nota ${sale.nota === undefined ? '?' : two(sale.nota)}`
  const reference = (q: CurrencyQuote) => q.similar ?? q.all
  const convertedText = (q: CurrencyQuote) =>
    q.converted === undefined ? null : q.currency === 'gold' ? `≈ ${format.format(Math.round(q.converted))} gemas` : `≈ ${compact.format(q.converted)} ouro`
</script>

<div class="page">
  <h2>Mercado</h2>
  <p class="hint">
    Preço pela <strong>espécie + shiny</strong>, com as vendas dos últimos 30 dias guardadas no seu PC. Nível, nota, IV e
    potência explicam a variação: compare com a venda mais cara e a mais barata.
  </p>

  <section class="card">
    <h3>Calculadora</h3>
    <label class="block">
      <span>Cole a ficha do pokémon <small>o texto da tela ou o "Copiar p/ ChatGPT"</small></span>
      <textarea rows="3" bind:value={pasted} oninput={onPaste} placeholder="Cole aqui…"></textarea>
    </label>
    {#if parseFailed}<p class="err">Não reconheci esse texto. Preencha a espécie abaixo.</p>{/if}

    <div class="fields">
      <label class="grow">
        Espécie
        <input type="text" list="market-species" maxlength="60" bind:value={name} placeholder="ex.: Infernape" />
        <datalist id="market-species">
          {#each names as species (species)}<option value={species}></option>{/each}
        </datalist>
      </label>
      <label class="check"><input type="checkbox" bind:checked={shiny} /> Shiny</label>
      <label class="small">
        Nota
        <input type="number" min="0" max="10" step="0.1" bind:value={nota} />
      </label>
      <button disabled={!request.name} onclick={calculate}>Calcular</button>
      <button
        disabled={!request.name || busy || market.alt === null}
        title={market.alt === null ? 'Nenhuma alt logada: a main não é usada' : 'Pede ao jogo as vendas desta espécie, por uma alt'}
        onclick={consult}
      >
        {busy ? 'Consultando…' : 'Buscar vendas no jogo'}
      </button>
    </div>
    {#if details}<small class="details">{details}</small>{/if}
    {#if message}<p class="message">{message}</p>{/if}

    {#if quote}
      <h4>{quote.shiny ? '✨ ' : ''}{quote.name}</h4>
      {#if quote.quotes.length === 0}
        <p class="muted">Nenhuma venda conhecida. Use "Buscar vendas no jogo".</p>
      {/if}
      <div class="quotes">
        {#each quote.quotes as q (q.currency)}
          <div class="quote">
            <strong>{CURRENCY_NAME[q.currency]}</strong>
            <small>
              {q.all.count} {q.all.count === 1 ? 'venda' : 'vendas'}{q.similar ? `, ${q.similar.count} com nota parecida (±0,5), usadas nos preços` : ''}{q.all.count < 3 ? ' · poucas para confiar' : ''}
            </small>
            <div class="tiers">
              {#each statsLine(reference(q), q.currency) as tier (tier.label)}
                <div class="tier" class:main={tier.main}>
                  <span>{tier.label}</span>
                  <b>{tier.value}</b>
                </div>
              {/each}
            </div>
            <small>
              Você recebe {money(q.netAtMedian, q.currency)} no preço justo, depois da comissão{convertedText(q) ? ` · ${convertedText(q)}` : ''}
            </small>
            <dl>
              <dt>Mais cara</dt>
              <dd><b>{money(q.highest.price, q.currency)}</b> {saleText(q.highest)}</dd>
              <dt>Mais barata</dt>
              <dd><b>{money(q.lowest.price, q.currency)}</b> {saleText(q.lowest)}</dd>
            </dl>
          </div>
        {/each}
      </div>

      {#if quote.recent.length}
        <table>
          <thead>
            <tr><th>Data</th><th class="num">Preço</th><th class="num">Nv</th><th>P</th><th class="num">IV</th><th class="num">Q</th><th class="num">Nota</th></tr>
          </thead>
          <tbody>
            {#each quote.recent as sale, i (i)}
              <tr>
                <td>{dateTime.format(sale.at)}</td>
                <td class="num">{money(sale.price, sale.currency)}</td>
                <td class="num">{sale.level ? format.format(sale.level) : '—'}</td>
                <td>{sale.potencia ? `P${sale.potencia}` : '—'}</td>
                <td class="num">{sale.iv ?? '—'}</td>
                <td class="num">{sale.quality === undefined ? '—' : two(sale.quality)}</td>
                <td class="num">{sale.nota === undefined ? '—' : two(sale.nota)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </section>

  <section class="card">
    <h3>Histórico local</h3>
    <dl class="status">
      <dt>Vendas guardadas</dt>
      <dd>{format.format(market.salesCount)}{market.oldestSaleAt ? `, desde ${date.format(market.oldestSaleAt)}` : ''}</dd>
      <dt>Cotação</dt>
      <dd>{market.goldPerGem ? `~${compact.format(market.goldPerGem)} de ouro por gema` : 'ainda sem dados; sai na próxima exportação'}</dd>
      <dt>Planilha diária</dt>
      <dd>
        {market.lastExportAt ? `última em ${dateTime.format(market.lastExportAt)}` : 'ainda não rodou'}{market.nextExportAt ? ` · próxima em ${dateTime.format(market.nextExportAt)}` : ''}
      </dd>
      <dt>Pedidos ao jogo</dt>
      <dd>{market.alt ? `por ${market.alt}; a main nunca é usada` : 'nenhuma alt logada; a main nunca é usada'}</dd>
    </dl>
    {#if market.exportProblem}<p class="err">{market.exportProblem}</p>{/if}
    <small>
      A planilha traz as ~5.000 vendas mais recentes (cerca de 3 dias), então o histórico leva dias para encher. Navegar
      pela Tabela de preços também alimenta o histórico.
    </small>
  </section>
</div>

<style>
  .page {
    overflow: auto;
    padding: 20px 24px;
    min-height: 0;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 14px;
  }
  h4 {
    margin: 14px 0 8px;
    font-size: 14px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 16px;
    max-width: 860px;
    line-height: 1.5;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
    max-width: 980px;
  }
  small {
    color: var(--muted);
    font-size: 11px;
  }
  .block {
    display: block;
    margin-bottom: 8px;
  }
  textarea,
  input[type='text'],
  input[type='number'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
    box-sizing: border-box;
    width: 100%;
  }
  textarea {
    margin-top: 4px;
    resize: vertical;
    font-size: 12px;
  }
  .fields {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .fields label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--muted);
  }
  .grow {
    flex: 1;
    min-width: 200px;
  }
  .small {
    width: 80px;
  }
  .fields .check {
    flex-direction: row;
    align-items: center;
    gap: 5px;
    padding-bottom: 5px;
  }
  .details {
    display: block;
    margin-top: 6px;
  }
  .message {
    margin: 8px 0 0;
  }
  .err {
    color: var(--err);
    margin: 6px 0;
  }
  .muted {
    color: var(--muted);
  }
  .quotes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }
  .quote {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
  }
  .tiers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .tier {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px;
    text-align: center;
  }
  .tier span {
    display: block;
    font-size: 11px;
    color: var(--muted);
  }
  .tier.main {
    border-color: var(--twitch);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 3px 10px;
    margin: 0;
    font-size: 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .status {
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    color: var(--muted);
    font-weight: normal;
    border-bottom: 1px solid var(--line);
    padding: 4px 6px;
  }
  td {
    padding: 3px 6px;
    border-bottom: 1px solid var(--line);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
