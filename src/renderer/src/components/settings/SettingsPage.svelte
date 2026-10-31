<script lang="ts">
  import type { AppState } from '../../../../shared/ipc'
  import { slotName } from '../../lib/slots'
  import { ui, type SettingsSection } from '../../lib/ui.svelte'
  import SlotSettings from './SlotSettings.svelte'
  import SystemSection from './SystemSection.svelte'
  import TwitchSection from './TwitchSection.svelte'
  import MemoryPanel from './MemoryPanel.svelte'

  let { app }: { app: AppState } = $props()

  const sections: { id: SettingsSection; label: string }[] = [
    { id: 'slots', label: 'Slots' },
    { id: 'twitch', label: 'Twitch' },
    { id: 'system', label: 'Sistema' },
    { id: 'about', label: 'Sobre' },
  ]
</script>

<div class="page">
  <nav>
    {#each sections as s (s.id)}
      <button class:active={ui.settingsSection === s.id} onclick={() => (ui.settingsSection = s.id)}>{s.label}</button>
    {/each}
  </nav>

  <div class="content">
    {#if ui.settingsSection === 'slots'}
      <h2>Slots</h2>
      <p class="hint">Cada slot é um navegador separado: o login fica salvo mesmo desativando o slot.</p>
      <div class="cards">
        {#each app.slots as slot (slot.id)}
          <section class="card" class:off={!slot.enabled}>
            <h3>
              {slotName(slot)}
              <small>{slot.id}{slot.game.level !== undefined ? ` · Nv ${slot.game.level}` : ''}</small>
            </h3>
            <SlotSettings item={slot} />
          </section>
        {/each}
      </div>
    {:else if ui.settingsSection === 'twitch'}
      <TwitchSection twitch={app.twitch} />
    {:else if ui.settingsSection === 'system'}
      <SystemSection system={app.system} />
    {:else}
      <h2>Sobre</h2>
      <dl>
        <dt>Versão</dt>
        <dd>{app.info.version}</dd>
        <dt>Electron</dt>
        <dd>{app.info.electron}</dd>
        <dt>Dados</dt>
        <dd><code>{app.info.dataDir}</code></dd>
      </dl>
      <p class="hint">
        Para atualizar, baixe o instalador novo nos Releases do repositório (logado no GitHub) e instale por cima.
        Logins e configurações são mantidos.
      </p>
      <div class="buttons">
        <button onclick={() => window.deck.openReleases()}>Abrir Releases ↗</button>
        <button onclick={() => window.deck.openLogs()}>Abrir pasta de logs</button>
      </div>
      <MemoryPanel diagnostics={app.diagnostics} />
    {/if}
  </div>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    min-height: 0;
    height: 100%;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    background: var(--panel-2);
    border-right: 1px solid var(--line);
  }
  nav button {
    text-align: left;
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 6px 10px;
  }
  nav button.active {
    background: var(--twitch-soft);
    color: var(--text);
  }
  .content {
    overflow: auto;
    padding: 20px 24px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 16px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 12px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .card.off {
    opacity: 0.7;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 14px;
  }
  h3 small {
    color: var(--muted);
    font-weight: normal;
    font-size: 11px;
    margin-left: 6px;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 12px 0 16px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  code {
    font-size: 12px;
    user-select: text;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
</style>
