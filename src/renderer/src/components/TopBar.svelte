<script lang="ts">
  import type { AppState } from '../../../shared/ipc'

  let { app }: { app: AppState } = $props()
</script>

<header>
  <strong>Deck Chat</strong>

  <nav aria-label="Slots">
    {#each app.slots as slot (slot.id)}
      <button
        class:on={slot.enabled}
        title={slot.enabled ? 'Desativar (o login continua salvo)' : 'Ativar'}
        onclick={() => window.deck.slots.setEnabled(slot.id, !slot.enabled)}
      >
        {slot.game.nick ?? slot.label}
      </button>
    {/each}
  </nav>

  <button onclick={() => window.deck.openLogs()}>Abrir logs</button>
  <button title="Esconde a janela na bandeja; os jogos continuam rodando" onclick={() => window.deck.hideToTray()}>
    ⤓ Bandeja
  </button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  nav {
    display: flex;
    gap: 6px;
    margin-right: auto;
  }
  nav button {
    color: var(--muted);
    border-style: dashed;
  }
  nav button.on {
    color: var(--text);
    border-style: solid;
    border-color: var(--twitch);
    background: var(--twitch-soft);
  }
</style>
