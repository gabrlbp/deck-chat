<script lang="ts">
  import type { AppState, WindowMode } from '../../../shared/ipc'

  let { app }: { app: AppState } = $props()

  const modeLabel: Record<WindowMode, string> = {
    focused: 'janela em foco',
    unfocused: 'janela sem foco',
    minimized: 'minimizada',
    tray: 'na bandeja',
  }
</script>

<header>
  <strong>Deck Chat</strong>
  <span class="tag">spike S2/S3</span>

  <nav aria-label="Slots">
    {#each app.slots as slot (slot.id)}
      <button
        class:on={slot.enabled}
        title={slot.enabled ? 'Desativar (o login continua salvo)' : 'Ativar'}
        onclick={() => window.deck.slots.setEnabled(slot.id, !slot.enabled)}
      >
        {slot.label}
      </button>
    {/each}
  </nav>

  <span class="mode">{modeLabel[app.windowMode]}</span>
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
  .tag {
    font-size: 11px;
    color: var(--warn);
    border: 1px solid var(--warn);
    border-radius: 99px;
    padding: 0 8px;
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
  .mode {
    color: var(--muted);
  }
</style>
