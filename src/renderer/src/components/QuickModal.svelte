<script lang="ts">
  import type { Snippet } from 'svelte'
  import { closeModal, ui } from '../lib/ui.svelte'

  let { title, children }: { title: string; children: Snippet } = $props()

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeModal()
  }
</script>

<svelte:window {onkeydown} />

<div class="layer">
  <!-- fotos dos jogos nos mesmos lugares, desfocadas: parece um overlay sobre os slots ao vivo -->
  {#each ui.snapshots as shot (shot.id)}
    <img
      src={shot.dataUrl}
      alt=""
      style:left="{shot.bounds.x}px"
      style:top="{shot.bounds.y}px"
      style:width="{shot.bounds.width}px"
      style:height="{shot.bounds.height}px"
    />
  {/each}

  <button class="backdrop" aria-label="Fechar" onclick={closeModal}></button>

  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <button class="close" aria-label="Fechar" onclick={closeModal}>✕</button>
    </header>
    {@render children()}
  </div>
</div>

<style>
  .layer {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
  }
  img {
    position: fixed;
    object-fit: cover;
    filter: blur(4px) brightness(0.5);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    border-radius: 0;
    background: #0008;
    cursor: default;
  }
  .dialog {
    position: relative;
    width: min(440px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow: auto;
    background: var(--panel-2);
    border: 1px solid var(--twitch);
    border-radius: 10px;
    padding: 16px;
    box-shadow: 0 20px 60px #000c;
  }
  header {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    margin-right: auto;
  }
  .close {
    border: 0;
    background: transparent;
    color: var(--muted);
  }
</style>
