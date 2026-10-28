<script lang="ts">
  import type { SlotState, SlotStatus } from '../../../shared/ipc'
  import { ZOOM_MAX, ZOOM_MIN } from '../../../shared/schemas'

  let { slot, layoutKey }: { slot: SlotState; layoutKey: string } = $props()

  let area = $state<HTMLDivElement>()
  // $derived de um primitivo: o efeito abaixo não re-roda a cada atualização de estado do slot
  const id = $derived(slot.id)

  const statusLabel: Record<SlotStatus, string> = {
    loading: 'carregando',
    ok: 'ok',
    error: 'erro ao carregar',
    crashed: 'travou, recarregando',
    unresponsive: 'sem resposta, recarregando',
    disabled: 'desativado',
  }

  const numberFormat = new Intl.NumberFormat('pt-BR')

  const gameText = $derived.by(() => {
    const g = slot.game
    const parts = [
      g.level !== undefined ? `Nv ${g.level}` : null,
      g.hunt ?? null,
      g.balls !== undefined ? `🔴 ${numberFormat.format(g.balls)}` : null,
    ].filter((part) => part !== null)
    return parts.join(' · ')
  })
  const noBalls = $derived(slot.game.balls === 0)

  function zoomBy(delta: number) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, slot.zoom + delta))
    window.deck.slots.setZoom(slot.id, Math.round(next * 10) / 10)
  }

  // informa ao main onde a view nativa do jogo deve ser desenhada
  $effect(() => {
    void layoutKey
    const el = area
    const slotId = id
    if (!el) return

    const report = () => {
      const r = el.getBoundingClientRect()
      window.deck.slots.setBounds(slotId, {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      })
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    report()

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  })
</script>

<section class="frame">
  <header>
    <span class="dot {slot.status}" title={statusLabel[slot.status]}></span>
    <strong>{slot.game.nick ?? slot.label}</strong>
    {#if slot.status !== 'ok'}
      <span class="muted">{statusLabel[slot.status]}</span>
    {/if}
    {#if gameText}
      <span class="game" class:warn={noBalls}>{gameText}</span>
    {/if}
    {#if slot.game.msgsPerMin !== undefined}
      <span class="muted" title="Mensagens do servidor por minuto (vigia de saúde)">
        {Math.round(slot.game.msgsPerMin)}/min
      </span>
    {/if}

    <div class="actions">
      <button title="Diminuir zoom" onclick={() => zoomBy(-0.1)}>−</button>
      <span class="zoom">{Math.round(slot.zoom * 100)}%</span>
      <button title="Aumentar zoom" onclick={() => zoomBy(0.1)}>+</button>
      <button
        title={slot.muted ? 'Desmutar' : 'Mutar'}
        onclick={() => window.deck.slots.setMuted(slot.id, !slot.muted)}
      >
        {slot.muted ? '🔇' : '🔊'}
      </button>
      <button title="Recarregar" onclick={() => window.deck.slots.reload(slot.id)}>⟳</button>
    </div>
  </header>

  <div class="area" bind:this={area}></div>
</section>

<style>
  .frame {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    min-width: 0;
    background: var(--panel);
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
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
  .game,
  .zoom {
    color: var(--muted);
    font-size: 12px;
  }
  .game {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .game.warn {
    color: var(--err);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }
  .zoom {
    min-width: 36px;
    text-align: center;
  }
  .area {
    min-height: 0;
  }
</style>
