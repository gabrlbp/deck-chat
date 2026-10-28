<script lang="ts">
  import { ui, type Tab } from '../lib/ui.svelte'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: 'Contas' },
    { id: 'settings', label: 'Configurações' },
  ]
</script>

<header>
  <strong>Deck Chat</strong>

  <nav aria-label="Abas">
    {#each tabs as tab (tab.id)}
      <button class:active={ui.tab === tab.id} onclick={() => (ui.tab = tab.id)}>{tab.label}</button>
    {/each}
  </nav>

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
</style>
