<script lang="ts">
  import type { RecorderState } from '../../../shared/ipc'

  let { recorder }: { recorder: RecorderState } = $props()

  let note = $state('')
  const mb = $derived((recorder.bytes / 1024 / 1024).toFixed(1))

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const text = note.trim()
    if (!text) return
    window.deck.recorder.mark(text)
    note = ''
  }
</script>

<div class="bar" class:active={recorder.active}>
  <span class="tag">spike S4</span>
  {#if recorder.active}
    <span class="rec">⏺ gravando mensagens WS · {mb} MB</span>
    <form onsubmit={submit}>
      <input bind:value={note} maxlength="200" placeholder="Viu algo? Descreva e aperte Enter (ex.: Alt B shiny Gengar)" />
    </form>
    <button onclick={() => window.deck.recorder.stop()}>⏹ Parar</button>
  {:else}
    <span class="muted">Grava as mensagens do servidor dos slots para descobrir o formato de drops e shinies.</span>
    <button onclick={() => window.deck.recorder.start()}>⏺ Gravar</button>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  .bar.active {
    background: #ff4f4f14;
  }
  .tag {
    font-size: 11px;
    color: var(--warn);
    border: 1px solid var(--warn);
    border-radius: 99px;
    padding: 0 8px;
  }
  .rec {
    color: var(--err);
    white-space: nowrap;
  }
  .muted {
    color: var(--muted);
    margin-right: auto;
  }
  form {
    flex: 1;
  }
  input {
    width: 100%;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 8px;
  }
  input:focus {
    outline: none;
    border-color: var(--twitch);
  }
</style>
