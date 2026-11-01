<script lang="ts">
  import type { MemorySample } from '../../../../shared/ipc'

  let { memory }: { memory: MemorySample | null } = $props()

  const hasPrivate = $derived(memory?.total.privateMb !== undefined)
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmt = (value: number | undefined) => (value === undefined ? '—' : `${Math.round(value)} MB`)
</script>

<h2>Memória</h2>
<p class="hint">
  Atualiza a cada minuto. O histórico fica em <code>logs/memory.csv</code> (uma amostra a cada 10 min).
</p>

{#if !memory}
  <p class="hint">A primeira medição sai 30 s depois de abrir o app.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>Processo</th>
        {#if hasPrivate}<th title="Memória só deste processo (o que o Gerenciador de Tarefas mostra)">Privada</th>{/if}
        <th title="Memória física em uso, incluindo a compartilhada">Working set</th>
      </tr>
    </thead>
    <tbody>
      {#each memory.processes as p (p.pid)}
        <tr>
          <td>{p.label} <small>pid {p.pid}</small></td>
          {#if hasPrivate}<td>{fmt(p.privateMb)}</td>{/if}
          <td>{fmt(p.workingSetMb)}</td>
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <td>Total <small>medido às {timeFormat.format(memory.at)}</small></td>
        {#if hasPrivate}<td>{fmt(memory.total.privateMb)}</td>{/if}
        <td>{fmt(memory.total.workingSetMb)}</td>
      </tr>
    </tfoot>
  </table>
{/if}

<style>
  h2 {
    margin: 24px 0 4px;
    font-size: 16px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 12px;
  }
  code {
    font-size: 12px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 640px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: right;
    padding: 5px 10px;
    border-bottom: 1px solid var(--line);
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  th {
    color: var(--muted);
    font-weight: normal;
    font-size: 12px;
  }
  tfoot td {
    font-weight: 600;
    border-bottom: 0;
  }
  small {
    color: var(--muted);
    font-weight: normal;
    font-size: 11px;
    margin-left: 4px;
  }
</style>
