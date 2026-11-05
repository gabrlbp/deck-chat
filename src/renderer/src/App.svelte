<script lang="ts">
  import type { AppState } from '../../shared/ipc'
  import FocusCard from './components/FocusCard.svelte'
  import MarketPage from './components/MarketPage.svelte'
  import MarketPanel from './components/MarketPanel.svelte'
  import ModalHost from './components/ModalHost.svelte'
  import NotificationsPage from './components/NotificationsPage.svelte'
  import SettingsPage from './components/settings/SettingsPage.svelte'
  import SlotFrame from './components/SlotFrame.svelte'
  import TopBar from './components/TopBar.svelte'
  import { connectFeed, feed } from './lib/events.svelte'
  import { slotsVisible, ui } from './lib/ui.svelte'

  let app = $state<AppState | null>(null)

  $effect(() => {
    void window.deck.getState().then((initial) => (app ??= initial))
    return window.deck.onState((next) => (app = next))
  })

  $effect(() => connectFeed(() => ui.tab === 'notifications'))

  // abrir a aba Notificações marca tudo como lido
  $effect(() => {
    if (ui.tab === 'notifications') feed.unread = 0
  })

  // os jogos são views nativas por cima da UI: escondê-las quando a UI precisa da tela toda
  $effect(() => {
    window.deck.slots.setVisible(slotsVisible())
  })

  const enabled = $derived(app?.slots.filter((s) => s.enabled) ?? [])
  const cols = $derived(enabled.length <= 1 ? 1 : 2)
  const rows = $derived(enabled.length <= 2 ? 1 : 2)

  // modo foco (F6): só vale para um slot ativo; desativar o slot focado volta ao grid
  const focused = $derived(enabled.find((s) => s.id === ui.focus))
  $effect(() => {
    if (ui.focus && app && !focused) ui.focus = null
  })
  $effect(() => {
    window.deck.slots.setFocus(focused?.id ?? null)
  })
  const others = $derived(enabled.filter((s) => s.id !== focused?.id))

  // muda quando o layout se reorganiza, para cada slot remedir a sua área
  const showMarketPanel = $derived(!ui.marketPanelClosed && app?.market.listings !== undefined)
  const layoutKey = $derived(`${enabled.map((s) => s.id).join(',')}|${focused?.id ?? ''}|${showMarketPanel}`)

  function onkeydown(event: KeyboardEvent) {
    // o modal trata o próprio Esc (e marca defaultPrevented); aqui o Esc sai do foco.
    // Com o jogo em foco no teclado, o Esc vai para o jogo: use o botão ⛶ ou um cartão.
    if (event.key !== 'Escape' || event.defaultPrevented || ui.modal || !ui.focus) return
    ui.focus = null
  }
</script>

<svelte:window {onkeydown} />

{#if app}
  <div class="shell">
    <TopBar {app} />

    {#if ui.tab === 'settings'}
      <SettingsPage {app} />
    {:else if ui.tab === 'market'}
      <MarketPage market={app.market} />
    {:else if ui.tab === 'notifications'}
      <NotificationsPage {app} />
    {:else if enabled.length === 0}
      <div class="empty">
        Nenhum slot ativo.
        <button onclick={() => (ui.tab = 'settings')}>Ativar em Configurações</button>
      </div>
    {:else}
      <div class="accounts" class:with-panel={showMarketPanel}>
      {#if focused}
      <main class="focus" class:solo={others.length === 0}>
        {#key focused.id}
          <SlotFrame slot={focused} {layoutKey} />
        {/key}
        {#if others.length}
          <aside aria-label="Outras alts">
            {#each others as slot (slot.id)}
              <FocusCard {slot} />
            {/each}
          </aside>
        {/if}
      </main>
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
      {#if showMarketPanel && app.market.listings}
        <MarketPanel listings={app.market.listings} goldPerGem={app.market.goldPerGem} {app} />
      {/if}
      </div>
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
  .accounts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .accounts.with-panel {
    grid-template-columns: minmax(0, 1fr) 430px;
  }
  .grid {
    display: grid;
    gap: 1px;
    background: var(--line);
    min-height: 0;
  }
  .focus {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 1px;
    background: var(--line);
    min-height: 0;
  }
  .focus.solo {
    grid-template-columns: minmax(0, 1fr);
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: var(--panel-2);
    overflow: auto;
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
