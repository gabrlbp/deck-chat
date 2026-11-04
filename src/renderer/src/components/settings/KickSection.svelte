<script lang="ts">
  import type { KickState } from '../../../../shared/kick'
  import { BONUS_TYPES, type BonusType, type KickConfig } from '../../../../shared/schemas'
  import { clock } from '../../lib/clock.svelte'

  let { kick }: { kick: KickState } = $props()

  const BONUS_NAME: Record<BonusType, string> = { xp: 'XP', captura: 'Captura', shiny: 'Shiny' }
  const numberFormat = new Intl.NumberFormat('pt-BR')
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const channels = $derived(
    [...kick.channels].sort(
      (a, b) =>
        Number(b.watching) - Number(a.watching) || Number(b.live) - Number(a.live) || (b.points ?? 0) - (a.points ?? 0),
    ),
  )
  const totalPoints = $derived(kick.channels.reduce((sum, c) => sum + (c.points ?? 0), 0))
  const memoryTotal = $derived(kick.channels.reduce((sum, c) => sum + (c.memoryMb ?? 0), 0))
  const cost = (tipo: BonusType) => kick.rewards.find((r) => r.tipo === tipo)?.custo

  function remaining(until: number | undefined): string | null {
    const ms = (until ?? 0) - clock.now
    if (ms <= 0) return null
    const minutes = Math.ceil(ms / 60_000)
    return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
  }
  const minutesSince = (since: number) => Math.max(0, Math.floor((clock.now - since) / 60_000))
  const setRedeem = (redeem: KickConfig['redeem']) => window.deck.kick.set({ redeem })
</script>

<h2>Kick</h2>
<p class="hint">
  Mantém lives dos canais oficiais abertas e escondidas, em 160p e sem som, para juntar pontos na conta principal. A
  Kick só conta <strong>2 lives por conta</strong>, somando celular e TV. Medido: ~100 pontos por hora por live, ~230 MB
  de memória por live. Assistir assim pode ir contra as regras da Kick e do jogo; use por sua conta e risco.
</p>

<section class="card">
  <h3>Conta da Kick (main)</h3>
  <div class="row">
    {#if kick.login === 'logged-in'}
      <span>
        Logado na Kick
        <small>
          {kick.linked
            ? `no jogo: vinculada a ${kick.linked.login ?? '?'} (${kick.linked.slot})`
            : 'nenhum slot aberto com a Kick vinculada; sem o vínculo, o resgate automático não roda'}
        </small>
      </span>
      <button onclick={() => window.deck.kick.logout()}>Sair da conta</button>
    {:else if kick.loggingIn}
      <span>Entre na janela da Kick que abriu e feche-a quando terminar.</span>
    {:else}
      <span>
        Sem login, a Kick não dá pontos.
        <small>O login é feito na página da própria Kick; o app guarda só os cookies, como um navegador.</small>
      </span>
      <button class="primary" onclick={() => window.deck.kick.login()}>Entrar na Kick</button>
    {/if}
  </div>
  {#if kick.problem}<p class="err">{kick.problem}</p>{/if}
</section>

<section class="card">
  <h3>Farm</h3>
  <label class="row">
    <span>
      Lives ao mesmo tempo
      <small>{memoryTotal ? `usando ${Math.round(memoryTotal)} MB agora` : 'cada live usa ~230 MB'}</small>
    </span>
    <select value={kick.config.lives} onchange={(e) => window.deck.kick.set({ lives: Number(e.currentTarget.value) })}>
      <option value={0}>Desligado</option>
      <option value={1}>1 live</option>
      <option value={2}>2 lives</option>
    </select>
  </label>
</section>

<section class="card">
  <h3>Bônus</h3>
  <div class="bonuses">
    {#each BONUS_TYPES as tipo (tipo)}
      {@const left = remaining(kick.bonus[tipo])}
      <div class="bonus" class:active={left !== null} class:target={kick.target === tipo}>
        <strong>{BONUS_NAME[tipo]}</strong>
        <small>{cost(tipo) !== undefined ? `${cost(tipo)} pontos` : '—'}</small>
        <span>{left ?? 'sem bônus'}</span>
        {#if kick.target === tipo}<small class="aim">próximo resgate</small>{/if}
      </div>
    {/each}
  </div>

  <div class="options">
    <label>
      <input type="radio" name="redeem" checked={kick.config.redeem === 'none'} onchange={() => setRedeem('none')} />
      <span>Só avisar <small>notifica quando um canal alcança um bônus; você resgata na Loja</small></span>
    </label>
    <label>
      <input type="radio" name="redeem" checked={kick.config.redeem === 'one'} onchange={() => setRedeem('one')} />
      <span>Resgatar um bônus <small>gasta só nele, sempre que um canal tiver saldo</small></span>
      {#if kick.config.redeem === 'one'}
        <select
          value={kick.config.redeemType}
          onchange={(e) => window.deck.kick.set({ redeemType: e.currentTarget.value as BonusType })}
        >
          {#each BONUS_TYPES as tipo (tipo)}
            <option value={tipo}>{BONUS_NAME[tipo]}</option>
          {/each}
        </select>
      {/if}
    </label>
    <label>
      <input type="radio" name="redeem" checked={kick.config.redeem === 'all'} onchange={() => setRedeem('all')} />
      <span>Resgatar todos <small>mira o bônus com menos tempo restante e espera um canal ter saldo para ele</small></span>
    </label>
  </div>
  <small>
    O tempo dos bônus soma. As lives vão para o canal mais perto do próximo resgate. No máximo 6 resgates por hora; o
    resgate para sozinho se o jogo não creditar.
  </small>
  {#if kick.redeemBlocked}
    <p class="err">Resgate automático parado: {kick.redeemBlocked} Mude a opção acima para liberar de novo.</p>
  {/if}
</section>

<section class="card">
  <h3>
    Canais oficiais
    <small>
      lista do jogo · {numberFormat.format(totalPoints)} pontos no total · +{numberFormat.format(kick.gainedTotal)} nesta
      sessão{kick.polledAt ? ` · lido às ${timeFormat.format(kick.polledAt)}` : ''}
    </small>
  </h3>
  {#if channels.length === 0}
    <p class="muted">A lista oficial chega do jogo assim que algum slot estiver logado.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Canal</th>
          <th>Ao vivo</th>
          <th>Aberta</th>
          <th class="num">Pontos</th>
          <th class="num">Ganho</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each channels as c (c.slug)}
          <tr class:watching={c.watching}>
            <td>{c.nome}</td>
            <td class:ok={c.live} class:muted={!c.live}>
              {c.live ? `sim${c.viewers ? ` · ${numberFormat.format(c.viewers)}` : ''}` : 'não'}
            </td>
            <td>
              {#if c.watching && c.watchingSince}
                {minutesSince(c.watchingSince)} min <small>{c.video ?? ''}</small>
              {:else if c.coolingUntil}
                <span class="muted" title="Ficou aberta sem ganhar pontos">espera até {timeFormat.format(c.coolingUntil)}</span>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="num">{c.points === null ? '—' : numberFormat.format(c.points)}</td>
            <td class="num" class:ok={c.gained > 0}>{c.gained ? `+${numberFormat.format(c.gained)}` : '—'}</td>
            <td>
              <button
                class="link"
                title="Abre as recompensas do canal, para resgatar à mão"
                disabled={kick.login !== 'logged-in'}
                onclick={() => window.deck.kick.openStore(c.slug)}
              >
                Loja ↗
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
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
    max-width: 860px;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 14px;
  }
  h3 small {
    display: inline;
    font-weight: normal;
    margin-left: 8px;
  }
  p {
    margin: 8px 0 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 11px;
  }
  td small {
    display: inline;
    margin-left: 4px;
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 6px;
    flex: none;
  }
  .primary {
    background: var(--ok);
    border-color: var(--ok);
    color: #000;
  }
  .bonuses {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .bonus {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    color: var(--muted);
  }
  .bonus strong {
    color: var(--text);
    display: block;
  }
  .bonus.active span {
    color: var(--ok);
  }
  .bonus.target {
    border-color: var(--twitch);
  }
  .bonus .aim {
    color: var(--text);
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }
  .options label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .options label > span {
    flex: 1;
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
    padding: 4px 6px;
    border-bottom: 1px solid var(--line);
  }
  tr.watching td {
    background: color-mix(in srgb, var(--ok) 8%, transparent);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .ok {
    color: var(--ok);
  }
  .muted {
    color: var(--muted);
  }
  .err {
    color: var(--err);
  }
  .link {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 0 4px;
  }
  .link:hover:not(:disabled) {
    color: var(--text);
  }
</style>
