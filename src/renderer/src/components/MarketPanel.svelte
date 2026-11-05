<script lang="ts">
  import type { AppState } from '../../../shared/ipc'
  import type { Currency, ListingRow, MarketState } from '../../../shared/market'
  import { slotName } from '../lib/slots'
  import { ui } from '../lib/ui.svelte'

  let {
    listings,
    app,
  }: { listings: NonNullable<MarketState['listings']>; goldPerGem?: number; app: AppState } = $props()

  const format = new Intl.NumberFormat('pt-BR')
  const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const two = (value: number | undefined) => (value === undefined ? '?' : decimal.format(value))
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
  const money = (value: number, currency: Currency) =>
    currency === 'gold' ? `${compact.format(value)} ouro` : `${format.format(Math.round(value))} gemas`

  const source = $derived(app.slots.find((s) => s.id === listings.slot))
  let consulting = $state<number | null>(null)
  let message = $state('')

  function tone(row: ListingRow): string {
    if (!row.verdict) return 'unknown'
    if (row.verdict.diffPct <= -10) return 'cheap'
    if (row.verdict.diffPct >= 10) return 'expensive'
    return 'fair'
  }

  /** Pede ao jogo as vendas da espécie; a linha atualiza quando o estado do app chegar. */
  async function consult(row: ListingRow) {
    consulting = row.id
    message = ''
    const result = await window.deck.market.consult({ name: row.name, shiny: row.shiny })
    consulting = null
    message = result.error ?? `${row.name}: +${result.added} vendas novas`
  }
</script>

<aside aria-label="Preços dos anúncios">
  <header>
    <strong>🏷 Preços</strong>
    <small>anúncios vistos em {source ? slotName(source) : listings.slot}</small>
    <button class="close" title="Fechar o painel" onclick={() => (ui.marketPanelClosed = true)}>✕</button>
  </header>
  <p class="hint">Comparado com a mediana das vendas de espécie + shiny, na mesma moeda (≈ = convertida pela cotação).</p>
  {#if message}<p class="message">{message}</p>{/if}

  <ul>
    {#each listings.rows as row (row.id)}
      <li class={tone(row)}>
        <div class="line">
          <span class="name">{row.shiny ? '✨ ' : ''}{row.name}</span>
          <strong class="price">{money(row.price, row.currency)}</strong>
        </div>
        <div class="line details">
          <span>
            Nv {row.level ? format.format(row.level) : '?'} · P{row.potencia ?? '?'} · IV {row.iv ?? '?'} · Q {two(row.quality)} · nota {two(row.nota)}
          </span>
        </div>
        <div class="line verdict">
          {#if row.verdict}
            <span class="diff">
              {row.verdict.diffPct > 0 ? '▲' : row.verdict.diffPct < 0 ? '▼' : '='}
              {row.verdict.diffPct > 0 ? '+' : ''}{row.verdict.diffPct}%
            </span>
            <small>
              mediana {row.verdict.converted ? '≈ ' : ''}{money(row.verdict.median, row.currency)} · {row.verdict.count} vendas
            </small>
          {:else}
            <small>menos de 3 vendas conhecidas</small>
          {/if}
          <button
            class="link"
            disabled={consulting !== null || app.market.alt === null}
            title={app.market.alt === null ? 'Nenhuma alt logada para consultar' : 'Pede ao jogo as vendas desta espécie, por uma alt'}
            onclick={() => consult(row)}
          >
            {consulting === row.id ? 'consultando…' : 'consultar'}
          </button>
        </div>
      </li>
    {/each}
  </ul>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--panel-2);
    border-left: 1px solid var(--line);
    padding: 10px;
    gap: 6px;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  header small {
    color: var(--muted);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 0 4px;
  }
  .hint,
  .message {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }
  .message {
    color: var(--text);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    border: 1px solid var(--line);
    border-left: 3px solid var(--line);
    border-radius: 6px;
    padding: 5px 8px;
    background: var(--panel);
  }
  li.cheap {
    border-left-color: var(--ok);
  }
  li.expensive {
    border-left-color: var(--err);
  }
  li.fair {
    border-left-color: var(--warn);
  }
  .line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .price {
    flex: none;
  }
  .details {
    color: var(--muted);
    font-size: 11px;
  }
  .verdict {
    justify-content: flex-start;
  }
  .verdict small {
    color: var(--muted);
    font-size: 11px;
    flex: 1;
  }
  .diff {
    font-weight: 600;
    flex: none;
  }
  .cheap .diff {
    color: var(--ok);
  }
  .expensive .diff {
    color: var(--err);
  }
  .fair .diff {
    color: var(--warn);
  }
  .link {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 0;
    font-size: 11px;
    flex: none;
  }
  .link:hover:not(:disabled) {
    color: var(--text);
  }
</style>
