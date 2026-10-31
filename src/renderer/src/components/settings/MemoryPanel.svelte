<script lang="ts">
  import type { DiagnosticsState } from '../../../../shared/ipc'
  import { MEMORY_PHASES, type MemoryPhase } from '../../../../shared/schemas'

  let { diagnostics }: { diagnostics: DiagnosticsState } = $props()

  const phaseLabel: Record<MemoryPhase, string> = {
    '-': '— sem fase',
    A: 'A · normal (jogo visível)',
    B: 'B · opção do jogo que esconde o canvas',
    C: 'C · jogo escondido pelo app (🙈)',
    D: 'D · GPU desligada',
    E: 'E · noite rodando',
  }

  const memory = $derived(diagnostics.memory)
  const hasPrivate = $derived(memory?.total.privateMb !== undefined)
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fmt = (value: number | undefined) => (value === undefined ? '—' : `${Math.round(value)} MB`)
</script>

<h2>Memória <span class="tag">teste S5</span></h2>
<p class="hint">
  Uma amostra por minuto em <code>logs/s5-memory.csv</code>. Escolha a fase do teste antes de começar cada etapa: ela
  vai em cada linha do CSV.
</p>

<label class="phase">
  Fase do teste
  <select
    value={diagnostics.phase}
    onchange={(e) => window.deck.setPhase(e.currentTarget.value as MemoryPhase)}
  >
    {#each MEMORY_PHASES as phase (phase)}
      <option value={phase}>{phaseLabel[phase]}</option>
    {/each}
  </select>
</label>

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
  .tag {
    font-size: 11px;
    font-weight: normal;
    color: var(--warn);
    border: 1px solid var(--warn);
    border-radius: 99px;
    padding: 0 8px;
    margin-left: 6px;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 12px;
  }
  code {
    font-size: 12px;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 6px;
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
