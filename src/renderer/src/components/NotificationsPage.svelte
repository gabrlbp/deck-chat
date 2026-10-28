<script lang="ts">
  import type { AppState, GameEvent, GameEventKind } from '../../../shared/ipc'
  import type { SlotId } from '../../../shared/schemas'
  import { KINDS, clearFeed, feed } from '../lib/events.svelte'
  import { slotName } from '../lib/slots'

  let { app }: { app: AppState } = $props()

  const kinds = Object.keys(KINDS) as GameEventKind[]
  let hiddenKinds = $state<GameEventKind[]>([])
  let slotFilter = $state<SlotId | 'all'>('all')

  const visible = $derived(
    feed.events.filter((e) => !hiddenKinds.includes(e.kind) && (slotFilter === 'all' || e.slot === slotFilter)),
  )
  const countByKind = $derived(
    Object.fromEntries(kinds.map((k) => [k, feed.events.filter((e) => e.kind === k).length])) as Record<
      GameEventKind,
      number
    >,
  )
  // só alts que já geraram algum evento ou estão ativas
  const slotsWithEvents = $derived(
    app.slots.filter((s) => s.enabled || feed.events.some((e) => e.slot === s.id)),
  )

  function toggleKind(kind: GameEventKind) {
    hiddenKinds = hiddenKinds.includes(kind) ? hiddenKinds.filter((k) => k !== kind) : [...hiddenKinds, kind]
  }

  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  /** Nome no momento do evento; sem nick, o nome atual do slot. */
  function altName(event: GameEvent): string {
    if (event.nick) return event.nick
    const slot = app.slots.find((s) => s.id === event.slot)
    return slot ? slotName(slot) : event.slot
  }

  const slotIndex = (id: SlotId) => Number(id.slice(-1))
</script>

<div class="page">
  <header>
    <div class="chips" aria-label="Tipos">
      {#each kinds as kind (kind)}
        <button class="chip" class:on={!hiddenKinds.includes(kind)} onclick={() => toggleKind(kind)}>
          {KINDS[kind].icon}
          {KINDS[kind].label}
          <span class="count">{countByKind[kind]}</span>
        </button>
      {/each}
    </div>

    <select bind:value={slotFilter} aria-label="Alt">
      <option value="all">Todas as alts</option>
      {#each slotsWithEvents as slot (slot.id)}
        <option value={slot.id}>{slotName(slot)}</option>
      {/each}
    </select>

    <button onclick={clearFeed} disabled={feed.events.length === 0}>Limpar</button>
  </header>

  {#if visible.length === 0}
    <div class="empty">
      {#if feed.events.length === 0}
        Nenhum evento ainda nesta sessão. Shinies, drops, capturas e problemas das alts aparecem aqui.
      {:else}
        Nenhum evento com esses filtros.
      {/if}
    </div>
  {:else}
    <ol>
      {#each visible as event (event.id)}
        <li class={event.kind}>
          <time datetime={new Date(event.at).toISOString()}>{timeFormat.format(event.at)}</time>
          <span class="alt s{slotIndex(event.slot)}">{altName(event)}</span>
          <span class="icon" title={KINDS[event.kind].label}>{KINDS[event.kind].icon}</span>
          <span class="text">
            <strong>{event.title}</strong>
            {#if event.detail}<small>{event.detail}</small>{/if}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 6px;
    margin-right: auto;
    flex-wrap: wrap;
  }
  .chip {
    border-radius: 99px;
    color: var(--muted);
    border-style: dashed;
  }
  .chip.on {
    color: var(--text);
    border-style: solid;
    border-color: var(--twitch);
    background: var(--twitch-soft);
  }
  .count {
    font-size: 11px;
    color: var(--muted);
    margin-left: 2px;
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 6px;
  }
  .empty {
    display: grid;
    place-items: center;
    color: var(--muted);
    padding: 24px;
    text-align: center;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
  }
  li {
    display: grid;
    grid-template-columns: 70px 140px 24px minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line);
    user-select: text;
  }
  li.shiny {
    background: #ffcb0512;
  }
  li.shiny strong {
    color: #ffcb05;
  }
  li.problem strong {
    color: var(--err);
  }
  time {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }
  .alt {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* cor fixa por slot, para bater o olho e saber qual alt */
  .alt.s1 {
    color: #7cc4ff;
  }
  .alt.s2 {
    color: #c39bff;
  }
  .alt.s3 {
    color: #7ee0a8;
  }
  .alt.s4 {
    color: #ffb86b;
  }
  .icon {
    text-align: center;
  }
  .text {
    min-width: 0;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
  }
</style>
