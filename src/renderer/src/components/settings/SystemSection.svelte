<script lang="ts">
  import type { SystemState } from '../../../../shared/ipc'
  import { MEMORY_RELOAD_MAX_MB, MEMORY_RELOAD_MIN_MB } from '../../../../shared/schemas'

  let { system }: { system: SystemState } = $props()

  const gpuPending = $derived(system.hardwareAcceleration !== system.hardwareAccelerationActive)

  const reload = $derived(system.memoryReload)
  function setLimit(event: Event & { currentTarget: HTMLInputElement }) {
    const value = Math.round(Number(event.currentTarget.value))
    if (Number.isFinite(value) && value >= MEMORY_RELOAD_MIN_MB && value <= MEMORY_RELOAD_MAX_MB) {
      window.deck.setSystem({ memoryReload: { ...reload, limitMb: value } })
    } else {
      event.currentTarget.value = String(reload.limitMb)
    }
  }
</script>

<h2>Sistema</h2>
<p class="hint">Fechar a janela ou minimizar só esconde o app na bandeja; os jogos e a Twitch continuam rodando.</p>

<section class="card">
  {#if !system.autoStartSupported}
    <p class="note">Disponível só no app instalado no Windows.</p>
  {/if}

  <label class="row" class:disabled={!system.autoStartSupported}>
    <span>
      Iniciar com o Windows
      <small>abre o Deck Chat sozinho quando você entra no Windows</small>
    </span>
    <input
      type="checkbox"
      class="switch"
      disabled={!system.autoStartSupported}
      checked={system.startWithWindows}
      onchange={(e) => window.deck.setSystem({ startWithWindows: e.currentTarget.checked })}
    />
  </label>

  <label class="row" class:disabled={!system.autoStartSupported || !system.startWithWindows}>
    <span>
      Iniciar escondido na bandeja
      <small>ao iniciar com o Windows, vai direto para a bandeja sem abrir a janela</small>
    </span>
    <input
      type="checkbox"
      class="switch"
      disabled={!system.autoStartSupported || !system.startWithWindows}
      checked={system.startHidden}
      onchange={(e) => window.deck.setSystem({ startHidden: e.currentTarget.checked })}
    />
  </label>
</section>

<h3>Desempenho</h3>
<section class="card">
  <label class="row">
    <span>
      Aceleração por GPU
      <small>ligada, usa ~800 MB a mais de RAM; desligada, o desenho vai para a CPU. Vale após reiniciar</small>
    </span>
    <input
      type="checkbox"
      class="switch"
      checked={system.hardwareAcceleration}
      onchange={(e) => window.deck.setSystem({ hardwareAcceleration: e.currentTarget.checked })}
    />
  </label>
  {#if gpuPending}
    <div class="row">
      <span class="pending">
        A GPU está {system.hardwareAccelerationActive ? 'ligada' : 'desligada'} nesta execução. Reinicie para aplicar.
      </span>
      <button onclick={() => window.deck.relaunch()}>Reiniciar agora</button>
    </div>
  {/if}

  <label class="row">
    <span>
      Recarregar slot que passar do limite de memória
      <small>os jogos crescem com as horas; recarregar devolve a memória. Um slot por vez, no máximo 1x por hora cada, e nunca um slot na tela com a janela em foco</small>
    </span>
    <input
      type="checkbox"
      class="switch"
      checked={reload.enabled}
      onchange={(e) => window.deck.setSystem({ memoryReload: { ...reload, enabled: e.currentTarget.checked } })}
    />
  </label>
  <label class="row" class:disabled={!reload.enabled}>
    <span>
      Limite por slot
      <small>memória privada de cada slot (veja os valores atuais em Sobre)</small>
    </span>
    <span class="limit">
      <input
        type="number"
        min={MEMORY_RELOAD_MIN_MB}
        max={MEMORY_RELOAD_MAX_MB}
        step="50"
        disabled={!reload.enabled}
        value={reload.limitMb}
        onchange={setLimit}
      />
      MB
    </span>
  </label>
</section>

<style>
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 16px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 4px 14px;
    max-width: 760px;
  }
  .note {
    color: var(--warn);
    margin: 10px 0 4px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row.disabled {
    opacity: 0.5;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 11px;
  }
  h3 {
    margin: 20px 0 8px;
    font-size: 14px;
  }
  .limit {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    flex: none;
  }
  input[type='number'] {
    width: 80px;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 6px;
    text-align: right;
  }
  .pending {
    color: var(--warn);
  }
</style>
