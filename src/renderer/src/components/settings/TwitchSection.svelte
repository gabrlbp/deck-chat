<script lang="ts">
  import type { TwitchState } from '../../../../shared/ipc'
  import { clock } from '../../lib/clock.svelte'
  import { channelStatus, mmss, summarize } from '../../lib/twitch'

  let { twitch }: { twitch: TwitchState } = $props()

  const numberFormat = new Intl.NumberFormat('pt-BR')
  const summary = $derived(summarize(twitch, clock.now))
  const connected = $derived(twitch.connection === 'connected')

  const connectionLabel = { offline: 'chat desconectado', connecting: 'conectando ao chat…', connected: 'no chat' }

  let extra = $state('')
  const extraValid = $derived(/^[a-z0-9_]{2,25}$/.test(extra.trim().toLowerCase()))

  function addExtra(event: SubmitEvent) {
    event.preventDefault()
    if (!extraValid) return
    window.deck.twitch.addExtra(extra.trim().toLowerCase())
    extra = ''
  }
</script>

<h2>Twitch</h2>
<p class="hint">
  A conta da main fica conectada aos chats dos streamers oficiais, sem vídeo e sem tela de chat. Os bônus acumulam
  entre canais e só contam com o streamer ao vivo.
</p>

<section class="card">
  <h3>Conta da main</h3>
  {#if twitch.auth.state === 'connected'}
    <div class="row">
      <span>
        Conectado como <strong>{twitch.auth.login}</strong>
        <small class:ok={connected} class:wait={!connected}>{connectionLabel[twitch.connection]}</small>
      </span>
      <button onclick={() => window.deck.twitch.logout()}>Desconectar</button>
    </div>
  {:else if twitch.auth.state === 'pending'}
    <p>
      Abrimos a página de ativação no seu navegador. Confira se está logado com a <strong>conta da main</strong> e
      confirme este código:
    </p>
    <div class="code">{twitch.auth.userCode}</div>
    <div class="row">
      <small>expira em {mmss(twitch.auth.expiresAt - clock.now)}</small>
      <div class="actions">
        <button onclick={() => window.deck.twitch.openActivate()}>Abrir de novo</button>
        <button onclick={() => window.deck.twitch.cancelLogin()}>Cancelar</button>
      </div>
    </div>
  {:else}
    {#if twitch.auth.state === 'reauth'}
      <p class="err">{twitch.auth.reason}</p>
    {/if}
    <div class="row">
      <span>
        Use o navegador onde a main já está logada na Twitch.
        <small>O app só pede permissão de leitura do chat (chat:read).</small>
      </span>
      <button class="primary" onclick={() => window.deck.twitch.login()}>Conectar Twitch</button>
    </div>
  {/if}
</section>

<section class="card">
  <h3>
    Canais
    <small>{summary.live}/{summary.total} ao vivo · {summary.bonus} {summary.bonus === 1 ? 'bônus' : 'bônus'} (estimado)</small>
  </h3>

  {#if twitch.channels.length === 0}
    <p class="hint">A lista oficial chega do jogo assim que algum slot estiver logado.</p>
  {/if}

  <ul>
    {#each twitch.channels as channel (channel.login)}
      {@const status = channelStatus(channel, twitch, clock.now)}
      <li class:off={!channel.enabled}>
        <span class="name">
          {channel.nome}
          {#if channel.source === 'extra'}<span class="badge">extra</span>{/if}
          {#if channel.live && channel.viewers !== undefined}
            <small>{numberFormat.format(channel.viewers)} espectadores</small>
          {/if}
        </span>
        <span class="status {status.tone}">{status.text}</span>
        {#if channel.source === 'extra'}
          <button class="link" title="Remover canal extra" onclick={() => window.deck.twitch.removeExtra(channel.login)}>
            ✕
          </button>
        {/if}
        <input
          type="checkbox"
          class="switch"
          title={channel.enabled ? 'Sair deste chat' : 'Entrar neste chat'}
          checked={channel.enabled}
          onchange={(e) => window.deck.twitch.setChannelEnabled(channel.login, e.currentTarget.checked)}
        />
      </li>
    {/each}
  </ul>

  <form onsubmit={addExtra}>
    <input type="text" placeholder="Adicionar canal extra (ex.: nome_do_canal)" maxlength="25" bind:value={extra} />
    <button type="submit" disabled={!extraValid}>Adicionar</button>
  </form>
</section>

<style>
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 16px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
    max-width: 760px;
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
    line-height: 1.5;
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
  .actions {
    display: flex;
    gap: 8px;
  }
  .code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 26px;
    letter-spacing: 0.25em;
    text-align: center;
    padding: 10px;
    margin-bottom: 10px;
    border: 1px solid var(--twitch);
    border-radius: 8px;
    background: var(--bg);
    user-select: text;
  }
  .primary {
    background: var(--twitch);
    border-color: var(--twitch);
    color: #fff;
  }
  ul {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
  }
  li.off {
    opacity: 0.6;
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  .name small {
    display: inline;
    margin-left: 6px;
  }
  .badge {
    font-size: 10px;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0 6px;
    margin-left: 4px;
  }
  .status {
    font-size: 12px;
    white-space: nowrap;
  }
  .ok {
    color: var(--ok);
  }
  .wait {
    color: var(--warn);
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
  form {
    display: flex;
    gap: 8px;
  }
  input[type='text'] {
    flex: 1;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
  input[type='text']:focus {
    outline: none;
    border-color: var(--twitch);
  }
</style>
