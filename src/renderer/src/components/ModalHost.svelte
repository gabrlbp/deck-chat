<script lang="ts">
  import type { AppState } from '../../../shared/ipc'
  import { slotName } from '../lib/slots'
  import { closeModal, ui } from '../lib/ui.svelte'
  import QuickModal from './QuickModal.svelte'
  import SlotSettings from './settings/SlotSettings.svelte'

  let { app }: { app: AppState } = $props()

  const slot = $derived(ui.modal ? app.slots.find((s) => s.id === ui.modal?.id) : undefined)
  let clearing = $state(false)

  async function confirmClear() {
    if (!slot) return
    clearing = true
    try {
      await window.deck.slots.clearSession(slot.id)
    } finally {
      clearing = false
      closeModal()
    }
  }
</script>

{#if ui.modal && slot}
  {#if ui.modal.kind === 'slot'}
    <QuickModal title={slotName(slot)}>
      <SlotSettings item={slot} />
    </QuickModal>
  {:else if ui.modal.kind === 'clearSession'}
    <QuickModal title="Limpar sessão de {slotName(slot)}?">
      <p>
        Apaga o login, os cookies e os dados salvos do jogo <strong>neste slot</strong>. Depois é preciso logar de
        novo com personagem e senha. Os outros slots não são afetados.
      </p>
      <div class="actions">
        <button onclick={closeModal} disabled={clearing}>Cancelar</button>
        <button class="danger" onclick={confirmClear} disabled={clearing}>
          {clearing ? 'Limpando…' : 'Limpar sessão'}
        </button>
      </div>
    </QuickModal>
  {/if}
{/if}

<style>
  p {
    margin: 0 0 16px;
    color: var(--muted);
    line-height: 1.5;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .danger {
    color: #fff;
    background: var(--err);
    border-color: var(--err);
  }
</style>
