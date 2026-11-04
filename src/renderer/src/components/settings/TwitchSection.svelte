<script lang="ts">
  import { TWITCH_PHASE_IDS, TWITCH_PHASES, type TwitchPhase, type TwitchState } from '../../../../shared/twitch'
  import { clock } from '../../lib/clock.svelte'

  let { twitch }: { twitch: TwitchState } = $props()

  const numberFormat = new Intl.NumberFormat('pt-BR')
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const minutes = (since: number) => Math.max(0, Math.floor((clock.now - since) / 60_000))

  const channels = $derived(
    [...twitch.channels]
      .filter((c) => c.ativo || c.watching)
      .sort((a, b) => Number(b.watching) - Number(a.watching) || Number(b.live) - Number(a.live) || (b.viewers ?? 0) - (a.viewers ?? 0)),
  )
  const phaseMinutes = $derived(twitch.phaseStartedAt ? minutes(twitch.phaseStartedAt) : 0)
  const memoryTotal = $derived(twitch.channels.reduce((sum, c) => sum + (c.memoryMb ?? 0), 0))
  /** pontos/h na fase, ignorando os primeiros minutos até a primeira contagem */
  const perHour = $derived(phaseMinutes > 10 ? Math.round((twitch.gainedPhase / (phaseMinutes - 5)) * 60) : null)
  const linked = $derived(twitch.game.find((g) => g.vinculado))
  const untilText = (bonus: Record<string, number> | undefined) => {
    const active = Object.entries(bonus ?? {}).filter(([, until]) => until > clock.now)
    return active.length ? active.map(([tipo, until]) => `${tipo} até ${timeFormat.format(until)}`).join(' · ') : 'nenhum ativo'
  }
</script>

<h2>Twitch <span class="tag">teste S8</span></h2>
<p class="hint">
  Desde 04/11/2026 o jogo só dá bônus da Twitch por <strong>pontos do canal</strong>, com o vídeo rodando na página: a
  presença no chat não conta mais e saiu do app. Este teste mede se a live escondida conta, quantas lives valem, quanta
  memória custam e como são o baú e o resgate. Tudo é gravado em <code>logs/s8-twitch.csv</code>.
</p>

<section class="card">
  <h3>Conta da Twitch (main)</h3>
  <div class="row">
    {#if twitch.login === 'logged-in'}
      <span>
        Logado na Twitch
        <small>
          {linked ? `no jogo: vinculada a ${linked.login ?? '?'} · bônus: ${untilText(linked.bonus)}` : 'nenhum slot aberto com a Twitch vinculada no jogo'}
        </small>
      </span>
      <button onclick={() => window.deck.twitch.logout()}>Sair da conta</button>
    {:else if twitch.loggingIn}
      <span>Entre na janela da Twitch que abriu e feche-a quando terminar.</span>
    {:else}
      <span>
        Sem login, a Twitch não dá pontos.
        <small>O login é feito na página da própria Twitch; o app guarda só os cookies, como um navegador.</small>
      </span>
      <button class="primary" onclick={() => window.deck.twitch.login()}>Entrar na Twitch</button>
    {/if}
  </div>
</section>

<section class="card">
  <h3>Fase do teste</h3>
  <div class="row">
    <select
      value={twitch.phase}
      disabled={twitch.login !== 'logged-in'}
      onchange={(e) => window.deck.twitch.setPhase(e.currentTarget.value as TwitchPhase)}
    >
      {#each TWITCH_PHASE_IDS as id (id)}
        <option value={id}>{TWITCH_PHASES[id].label}</option>
      {/each}
    </select>
    {#if twitch.phaseStartedAt}
      <span class="muted">
        desde {timeFormat.format(twitch.phaseStartedAt)} · {phaseMinutes} min · +{numberFormat.format(twitch.gainedPhase)} pts{perHour !== null
          ? ` (~${numberFormat.format(perHour)}/h)`
          : ''} · {twitch.chestsPhase} baús · lives {Math.round(memoryTotal)} MB
      </span>
    {/if}
  </div>
  <small>Cada fase: ~40 min com as lives no ar. Trocar de fase reabre as lives e zera o ganho.</small>
</section>

<section class="card">
  <h3>
    Canais com pontos ativos
    <small>lista do jogo{twitch.polledAt ? ` · lido às ${timeFormat.format(twitch.polledAt)}` : ''}</small>
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
          <th class="num">Saldo</th>
          <th class="num">Baús</th>
          <th class="num">Memória</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each channels as c (c.login)}
          <tr class:watching={c.watching}>
            <td>{c.nome}</td>
            <td class:ok={c.live} class:muted={!c.live}>
              {c.live ? `sim${c.viewers ? ` · ${numberFormat.format(c.viewers)}` : ''}` : 'não'}
            </td>
            <td>
              {#if c.watching && c.watchingSince}
                {minutes(c.watchingSince)} min <small>{c.video ?? ''}</small>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="num">{c.balance ?? '—'}</td>
            <td class="num">{c.chests || '—'}</td>
            <td class="num">{c.memoryMb ? `${Math.round(c.memoryMb)} MB` : '—'}</td>
            <td>
              <button
                class="link"
                title="Abre os pontos do canal (chat popout) e grava os pedidos, para descobrir como o resgate funciona"
                disabled={twitch.login !== 'logged-in'}
                onclick={() => window.deck.twitch.openStore(c.login)}
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
    display: inline;
    font-weight: normal;
    margin-left: 8px;
  }
  p {
    margin: 0;
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
    background: var(--twitch);
    border-color: var(--twitch);
    color: #fff;
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
    background: color-mix(in srgb, var(--twitch) 12%, transparent);
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
