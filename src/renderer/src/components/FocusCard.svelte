<script lang="ts">
  import type { SlotState } from '../../../shared/ipc'
  import { KINDS, feed } from '../lib/events.svelte'
  import { slotName } from '../lib/slots'
  import { ui } from '../lib/ui.svelte'

  let { slot }: { slot: SlotState } = $props()

  // o feed vem do mais recente para o mais antigo
  const lastEvent = $derived(feed.events.find((e) => e.slot === slot.id))
  const gameText = $derived(
    [slot.game.level !== undefined ? `Nv ${slot.game.level}` : null, slot.game.hunt ?? null]
      .filter((part) => part !== null)
      .join(' · '),
  )
  const bad = $derived(['error', 'crashed', 'unresponsive'].includes(slot.status))
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
</script>

<button class="card" title="Colocar {slotName(slot)} em foco" onclick={() => (ui.focus = slot.id)}>
  <span class="head">
    <span class="dot {slot.status}"></span>
    <strong>{slotName(slot)}</strong>
  </span>
  {#if gameText}<span class="muted">{gameText}</span>{/if}
  {#if slot.retryAt !== undefined}
    <span class="err">sem resposta · nova tentativa às {timeFormat.format(slot.retryAt)}</span>
  {:else if bad}
    <span class="err">{slot.status === 'error' ? 'erro ao carregar' : 'sem resposta, recarregando'}</span>
  {/if}
  {#if lastEvent}
    <span class="event {lastEvent.kind}">
      {KINDS[lastEvent.kind].icon}
      {lastEvent.title}
      <small>{timeFormat.format(lastEvent.at)}</small>
    </span>
  {/if}
</button>

<style>
  .card {
    display: grid;
    gap: 3px;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--panel);
    font-size: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  strong {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: var(--off);
  }
  .dot.ok {
    background: var(--ok);
  }
  .dot.loading {
    background: var(--warn);
  }
  .dot.error,
  .dot.crashed,
  .dot.unresponsive {
    background: var(--err);
  }
  .muted,
  small {
    color: var(--muted);
  }
  .err {
    color: var(--err);
  }
  .event {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .event.shiny {
    color: #ffcb05;
  }
  .event.problem {
    color: var(--err);
  }
</style>
