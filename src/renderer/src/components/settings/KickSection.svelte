<script lang="ts">
  import { KICK_PHASE_IDS, KICK_PHASES, type KickPhase, type KickState } from '../../../../shared/kick'
  import { clock } from '../../lib/clock.svelte'

  let { kick }: { kick: KickState } = $props()

  const numberFormat = new Intl.NumberFormat('pt-BR')
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const minutes = (since: number) => Math.max(0, Math.floor((clock.now - since) / 60_000))

  const watching = $derived(kick.channels.filter((c) => c.watching))
  const gainedTotal = $derived(kick.channels.reduce((sum, c) => sum + c.gained, 0))
  const phaseMinutes = $derived(kick.phaseStartedAt ? minutes(kick.phaseStartedAt) : 0)
  /** pontos/h na fase, ignorando os ~7 min de aquecimento da primeira contagem */
  const perHour = $derived(phaseMinutes > 10 ? Math.round((gainedTotal / (phaseMinutes - 7)) * 60) : null)
  const memoryTotal = $derived(watching.reduce((sum, c) => sum + (c.memoryMb ?? 0), 0))

  function changePhase(event: Event & { currentTarget: HTMLSelectElement }) {
    window.deck.kick.setPhase(event.currentTarget.value as KickPhase)
  }
  const bonusText = (bonus: Record<string, unknown> | undefined) => (bonus ? JSON.stringify(bonus) : '—')
</script>

<h2>Kick <span class="tag">teste S6</span></h2>
<p class="hint">
  Mede se a Kick conta pontos com as lives abertas dentro do app, quantas valem ao mesmo tempo e quanta memória elas
  usam. Durante o teste: <strong>Kickterino fechado</strong> e nenhuma live da Kick aberta no celular ou na TV (elas
  disputam as mesmas vagas). Tudo é gravado em <code>logs/s6-kick.csv</code>.
</p>

<section class="card">
  <h3>Conta da Kick (main)</h3>
  <div class="row">
    {#if kick.login === 'logged-in'}
      <span>Logado na Kick</span>
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
</section>

<section class="card">
  <h3>Fase do teste</h3>
  <div class="row">
    <select value={kick.phase} onchange={changePhase} disabled={kick.login !== 'logged-in'}>
      {#each KICK_PHASE_IDS as id (id)}
        <option value={id}>{KICK_PHASES[id].label}</option>
      {/each}
    </select>
    {#if kick.phaseStartedAt}
      <span class="muted">
        desde {timeFormat.format(kick.phaseStartedAt)} · {phaseMinutes} min · +{numberFormat.format(gainedTotal)} pts{perHour !== null
          ? ` (~${numberFormat.format(perHour)}/h)`
          : ''} · lives {Math.round(memoryTotal)} MB
      </span>
    {/if}
  </div>
  <small>
    Cada fase: ~40 min com as lives no ar (a primeira contagem leva ~7 min). Trocar de fase reabre as lives e zera o
    ganho.
  </small>
  {#if kick.problem}<p class="err">{kick.problem}</p>{/if}
</section>

<section class="card">
  <h3>
    Bônus no jogo
    <small>bloco <code>kick</code> que o jogo manda, gravado a cada mudança em <code>logs/s6-kick-game.jsonl</code></small>
  </h3>
  {#if kick.game.length === 0}
    <p class="muted">Ainda não chegou de nenhum slot.</p>
  {:else}
    <ul class="plain">
      {#each kick.game as g (g.slot)}
        <li>
          <strong>{g.slot}</strong>
          {g.vinculado ? `vinculada a ${g.login ?? '?'}` : 'sem Kick vinculada'} · bônus <code>{bonusText(g.bonus)}</code>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="card">
  <h3>
    Canais oficiais
    <small>lista do jogo{kick.polledAt ? ` · saldos lidos às ${timeFormat.format(kick.polledAt)}` : ''}</small>
  </h3>
  {#if kick.channels.length === 0}
    <p class="muted">A lista oficial chega do jogo assim que algum slot estiver logado.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Canal</th>
          <th>Ao vivo</th>
          <th>Aberta</th>
          <th class="num">Pontos</th>
          <th class="num">Ganho na fase</th>
          <th class="num">Memória</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each kick.channels as c (c.slug)}
          <tr class:watching={c.watching}>
            <td>{c.nome}</td>
            <td class:ok={c.live === true} class:muted={c.live !== true}>
              {c.live === null ? '?' : c.live ? `sim${c.viewers ? ` · ${numberFormat.format(c.viewers)}` : ''}` : 'não'}
            </td>
            <td>
              {#if c.watching && c.watchingSince}
                {minutes(c.watchingSince)} min <small>{c.video ?? ''}</small>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="num">{c.points === null ? '—' : numberFormat.format(c.points)}</td>
            <td class="num" class:ok={c.gained > 0}>{c.gained ? `+${numberFormat.format(c.gained)}` : '—'}</td>
            <td class="num">{c.memoryMb ? `${Math.round(c.memoryMb)} MB` : '—'}</td>
            <td>
              <button
                class="link"
                title="Abre as recompensas do canal (chat popout) e grava a rede, para descobrir como o resgate funciona"
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
  .tag {
    font-size: 11px;
    font-weight: normal;
    color: var(--warn);
    border: 1px solid var(--warn);
    border-radius: 99px;
    padding: 0 8px;
    margin-left: 6px;
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
    color: var(--muted);
    font-weight: normal;
    margin-left: 8px;
  }
  p {
    margin: 0 0 10px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
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
  code {
    font-size: 11px;
    user-select: text;
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 6px;
  }
  .primary {
    background: var(--ok);
    border-color: var(--ok);
    color: #000;
  }
  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .plain li {
    padding: 3px 0;
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
