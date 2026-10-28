<script lang="ts">
  import type { AppState } from '../../shared/ipc'
  import ModalHost from './components/ModalHost.svelte'
  import SettingsPage from './components/settings/SettingsPage.svelte'
  import SlotFrame from './components/SlotFrame.svelte'
  import TopBar from './components/TopBar.svelte'
  import { slotsVisible, ui } from './lib/ui.svelte'

  let app = $state<AppState | null>(null)

  $effect(() => {
    void window.deck.getState().then((initial) => (app ??= initial))
    return window.deck.onState((next) => (app = next))
  })

  // os jogos são views nativas por cima da UI: escondê-las quando a UI precisa da tela toda
  $effect(() => {
    window.deck.slots.setVisible(slotsVisible())
  })

  const enabled = $derived(app?.slots.filter((s) => s.enabled) ?? [])
  const cols = $derived(enabled.length <= 1 ? 1 : 2)
  const rows = $derived(enabled.length <= 2 ? 1 : 2)
  // muda quando o grid se reorganiza, para cada slot remedir a sua área
  const layoutKey = $derived(enabled.map((s) => s.id).join(','))
</script>

{#if app}
  <div class="shell">
    <TopBar {app} />

    {#if ui.tab === 'settings'}
      <SettingsPage {app} />
    {:else if enabled.length === 0}
      <div class="empty">
        Nenhum slot ativo.
        <button onclick={() => (ui.tab = 'settings')}>Ativar em Configurações</button>
      </div>
    {:else}
      <main
        class="grid"
        style:grid-template-columns="repeat({cols}, minmax(0, 1fr))"
        style:grid-template-rows="repeat({rows}, minmax(0, 1fr))"
      >
        {#each enabled as slot (slot.id)}
          <SlotFrame {slot} {layoutKey} />
        {/each}
        {#if enabled.length === 3}
          <div class="filler">
            slot livre
            <button onclick={() => (ui.tab = 'settings')}>Ativar outro slot</button>
          </div>
        {/if}
      </main>
    {/if}
  </div>

  <ModalHost {app} />
{/if}

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .grid {
    display: grid;
    gap: 1px;
    background: var(--line);
    min-height: 0;
  }
  .filler,
  .empty {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    color: var(--muted);
    background: var(--panel);
  }
</style>
