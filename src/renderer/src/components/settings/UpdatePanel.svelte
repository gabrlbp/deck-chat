<script lang="ts">
  import type { UpdateState } from '../../../../shared/ipc'

  let { update }: { update: UpdateState } = $props()

  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
</script>

<h2>Atualização</h2>
{#if update.kind === 'unsupported'}
  <p class="hint">
    A atualização automática só funciona no app instalado no Windows. Na versão portátil (zip), baixe a nova nos
    Releases.
  </p>
{:else}
  <p class="hint">O app confere a cada 6 h se há versão nova e baixa sozinho. Logins e configurações são mantidos.</p>
  <div class="row">
    <span class="status" class:ok={update.kind === 'ready'} class:err={update.kind === 'error'}>
      {#if update.kind === 'idle'}
        Primeira verificação 1 min após abrir o app
      {:else if update.kind === 'checking'}
        Verificando…
      {:else if update.kind === 'latest'}
        Você está na versão mais recente ({update.current}) · verificado às {timeFormat.format(update.checkedAt)}
      {:else if update.kind === 'downloading'}
        Baixando a versão {update.version}… {update.percent}%
      {:else if update.kind === 'ready'}
        Versão {update.version} pronta para instalar (você está na {update.current})
      {:else if update.kind === 'error'}
        Não foi possível verificar às {timeFormat.format(update.checkedAt)}: {update.message}
      {/if}
    </span>
    {#if update.kind === 'ready'}
      <button class="primary" onclick={() => window.deck.update.install()}>Atualizar e reiniciar</button>
    {:else}
      <button
        disabled={update.kind === 'checking' || update.kind === 'downloading'}
        onclick={() => window.deck.update.check()}
      >
        Verificar agora
      </button>
    {/if}
  </div>
{/if}

<style>
  h2 {
    margin: 20px 0 4px;
    font-size: 16px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 10px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .status.ok {
    color: var(--ok);
  }
  .status.err {
    color: var(--err);
  }
  .primary {
    border-color: var(--ok);
    color: var(--ok);
  }
</style>
