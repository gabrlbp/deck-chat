<script lang="ts">
  import type { SystemState } from '../../../../shared/ipc'

  let { system }: { system: SystemState } = $props()

  const gpuPending = $derived(system.hardwareAcceleration !== system.hardwareAccelerationActive)
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

<h3>Desempenho <span class="tag">teste de memória S5</span></h3>
<section class="card">
  <label class="row">
    <span>
      Aceleração por GPU
      <small>desligada, o Chromium dispensa o processo de GPU e desenha tudo na CPU; vale após reiniciar</small>
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
  .tag {
    font-size: 11px;
    font-weight: normal;
    color: var(--warn);
    border: 1px solid var(--warn);
    border-radius: 99px;
    padding: 0 8px;
    margin-left: 6px;
  }
  .pending {
    color: var(--warn);
  }
</style>
