<script lang="ts">
  import type { SlotState } from '../../../../shared/ipc'
  import { zoomBy } from '../../lib/slots'
  import { openModal } from '../../lib/ui.svelte'

  let { item: slot }: { item: SlotState } = $props()

  let label = $state('')
  // sincroniza o campo quando o rótulo muda por fora (ex.: outra tela)
  $effect.pre(() => {
    label = slot.label
  })

  function saveLabel() {
    const next = label.trim().slice(0, 32)
    if (next && next !== slot.label) window.deck.slots.setLabel(slot.id, next)
    else label = slot.label
  }
</script>

<div class="rows">
  <label class="row">
    <span>Ativo</span>
    <input
      type="checkbox"
      class="switch"
      checked={slot.enabled}
      onchange={(e) => window.deck.slots.setEnabled(slot.id, e.currentTarget.checked)}
    />
  </label>

  <label class="row">
    <span>
      Rótulo
      <small>{slot.game.nick ? `logado como ${slot.game.nick}` : 'usado enquanto ninguém está logado'}</small>
    </span>
    <input
      type="text"
      maxlength="32"
      bind:value={label}
      onblur={saveLabel}
      onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  </label>

  <label class="row">
    <span>Mudo</span>
    <input
      type="checkbox"
      class="switch"
      checked={slot.muted}
      onchange={(e) => window.deck.slots.setMuted(slot.id, e.currentTarget.checked)}
    />
  </label>

  <div class="row">
    <span>Zoom</span>
    <div class="zoom">
      <button aria-label="Diminuir zoom" onclick={() => zoomBy(slot, -0.1)}>−</button>
      <span>{Math.round(slot.zoom * 100)}%</span>
      <button aria-label="Aumentar zoom" onclick={() => zoomBy(slot, 0.1)}>+</button>
    </div>
  </div>

  <div class="row">
    <span>Sessão <small>apaga o login e os dados do jogo deste slot</small></span>
    <button class="danger" onclick={() => openModal({ kind: 'clearSession', id: slot.id })}>Limpar sessão</button>
  </div>
</div>

<style>
  .rows {
    display: grid;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child {
    border-bottom: 0;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 11px;
  }
  input[type='text'] {
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
    width: 180px;
  }
  input[type='text']:focus {
    outline: none;
    border-color: var(--twitch);
  }
  .switch {
    appearance: none;
    width: 30px;
    height: 17px;
    border-radius: 99px;
    background: var(--off);
    position: relative;
    cursor: pointer;
    flex: none;
    margin: 0;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.12s;
  }
  .switch:checked {
    background: var(--twitch);
  }
  .switch:checked::after {
    left: 15px;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .zoom span {
    min-width: 40px;
    text-align: center;
    color: var(--muted);
  }
  .danger {
    color: var(--err);
    border-color: var(--err);
  }
</style>
