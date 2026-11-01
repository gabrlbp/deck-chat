<script lang="ts">
  import type { SlotState, SlotStatus } from '../../../shared/ipc'
  import { slotName } from '../lib/slots'
  import { openModal, toggleFocus, ui } from '../lib/ui.svelte'

  let { slot, layoutKey }: { slot: SlotState; layoutKey: string } = $props()

  let area = $state<HTMLDivElement>()
  // $derived de um primitivo: o efeito abaixo não re-roda a cada atualização de estado do slot
  const id = $derived(slot.id)

  const statusLabel: Record<SlotStatus, string> = {
    loading: 'carregando',
    ok: 'ok',
    error: 'erro ao carregar, tentando de novo em 1 min',
    crashed: 'travou, recarregando',
    unresponsive: 'sem resposta, recarregando',
    disabled: 'desativado',
  }

  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const gameText = $derived(
    [slot.game.level !== undefined ? `Nv ${slot.game.level}` : null, slot.game.hunt ?? null]
      .filter((part) => part !== null)
      .join(' · '),
  )

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
  <!-- duplo clique na barra (fora dos botões) liga/desliga o foco; o ⛶ faz o mesmo pelo teclado -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header
    ondblclick={(e) => {
      if (!(e.target as HTMLElement).closest('button')) toggleFocus(slot.id)
    }}
  >
    <span class="dot {slot.status}" title={statusLabel[slot.status]}></span>
    <strong>{slotName(slot)}</strong>
    {#if slot.retryAt !== undefined}
      <span class="silent" title="O vigia recarregou e o jogo ainda não voltou a responder">
        sem resposta · nova tentativa às {timeFormat.format(slot.retryAt)}
      </span>
    {:else if slot.status !== 'ok'}
      <span class="muted">{statusLabel[slot.status]}</span>
    {/if}
    {#if gameText}
      <span class="game">{gameText}</span>
    {/if}
    {#if slot.game.msgsPerMin !== undefined && (slot.game.msgsPerMin > 0 || slot.game.nick)}
      <span
        class="muted"
        class:silent={slot.game.msgsPerMin === 0}
        title="Mensagens do servidor por minuto (vigia de saúde)"
      >
        {Math.round(slot.game.msgsPerMin)}/min
      </span>
    {/if}

    <div class="actions">
      <button
        class:on={ui.focus === slot.id}
        title={ui.focus === slot.id ? 'Voltar ao grid (Esc)' : 'Foco: este slot ocupa o grid (duplo clique na barra)'}
        onclick={() => toggleFocus(slot.id)}
      >
        ⛶
      </button>
      <button
        title={slot.muted ? 'Desmutar' : 'Mutar'}
        onclick={() => window.deck.slots.setMuted(slot.id, !slot.muted)}
      >
        {slot.muted ? '🔇' : '🔊'}
      </button>
      <button title="Recarregar" onclick={() => window.deck.slots.reload(slot.id)}>⟳</button>
      <button title="Configurar slot (zoom, rótulo, sessão)" onclick={() => openModal({ kind: 'slot', id: slot.id })}>
        ⚙
      </button>
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
  .game {
    color: var(--muted);
    font-size: 12px;
  }
  /* o nível/hunt é o que encolhe primeiro quando falta espaço */
  .game {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  strong,
  .muted,
  .actions {
    flex: none;
  }
  .silent {
    color: var(--err);
  }
  .actions button.on {
    border-color: var(--twitch);
    background: var(--twitch-soft);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }
  .area {
    min-height: 0;
  }
</style>
