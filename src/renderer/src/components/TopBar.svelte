<script lang="ts">
  import type { AppState } from '../../../shared/ipc'
  import { feed } from '../lib/events.svelte'
  import { ui, type Tab } from '../lib/ui.svelte'
  import TwitchPill from './TwitchPill.svelte'

  let { app }: { app: AppState } = $props()

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: 'Contas' },
    { id: 'notifications', label: 'Notificações' },
    { id: 'settings', label: 'Configurações' },
  ]
</script>

<header>
  <strong>Deck Chat</strong>

  <nav aria-label="Abas">
    {#each tabs as tab (tab.id)}
      <button class:active={ui.tab === tab.id} onclick={() => (ui.tab = tab.id)}>
        {tab.label}
        {#if tab.id === 'notifications' && feed.unread > 0}
          <span class="badge" title="{feed.unread} não lidas">{feed.unread > 99 ? '99+' : feed.unread}</span>
        {/if}
      </button>
    {/each}
  </nav>

  {#if app.update.kind === 'ready'}
    <button
      class="update"
      title="A versão {app.update.version} já foi baixada. O app fecha, instala e abre de novo; logins e configurações são mantidos"
      onclick={() => window.deck.update.install()}
    >
      ⬆ Atualizar para {app.update.version} e reiniciar
    </button>
  {/if}
  <TwitchPill twitch={app.twitch} />
  <button title="Esconde a janela na bandeja; os jogos continuam rodando" onclick={() => window.deck.hideToTray()}>
    ⤓ Bandeja
  </button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  nav {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }
  nav button {
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 4px 10px;
  }
  nav button.active {
    color: var(--text);
    background: var(--bg);
    box-shadow: inset 0 -2px 0 var(--twitch);
  }
  .update {
    border-color: var(--ok);
    color: var(--ok);
  }
  .badge {
    display: inline-block;
    min-width: 18px;
    margin-left: 4px;
    padding: 0 5px;
    border-radius: 99px;
    background: var(--twitch);
    color: #fff;
    font-size: 11px;
    text-align: center;
  }
</style>
