import type { MemorySample, ProcessMemory } from '../../shared/ipc'

/** Subconjunto de `Electron.ProcessMetric` usado aqui (memória em KB). */
export type RawMetric = {
  pid: number
  type: string
  serviceName?: string
  name?: string
  memory: { workingSetSize: number; privateBytes?: number }
}

const mb = (kb: number) => Math.round((kb / 1024) * 10) / 10

function labelOf(metric: RawMetric, known: Map<number, string>): string {
  const label = known.get(metric.pid)
  if (label) return label
  if (metric.type === 'Browser') return 'app (main)'
  if (metric.type === 'GPU') return 'gpu'
  if (metric.type === 'Utility') return metric.name || metric.serviceName || 'utility'
  return metric.type.toLowerCase()
}

/** Dá nome aos processos (`known`: pid → "interface", "slot-1 · Nick"…) e soma o total. */
export function toSample(metrics: RawMetric[], known: Map<number, string>, at: number): MemorySample {
  const processes: ProcessMemory[] = metrics.map((m) => ({
    label: labelOf(m, known),
    type: m.type,
    pid: m.pid,
    workingSetMb: mb(m.memory.workingSetSize),
    privateMb: m.memory.privateBytes !== undefined ? mb(m.memory.privateBytes) : undefined,
  }))
  processes.sort((a, b) => (b.privateMb ?? b.workingSetMb) - (a.privateMb ?? a.workingSetMb))

  const hasPrivate = processes.every((p) => p.privateMb !== undefined)
  const sum = (pick: (p: ProcessMemory) => number) => Math.round(processes.reduce((s, p) => s + pick(p), 0) * 10) / 10
  return {
    at,
    total: { workingSetMb: sum((p) => p.workingSetMb), privateMb: hasPrivate ? sum((p) => p.privateMb ?? 0) : undefined },
    processes,
  }
}

export const CSV_HEADER = 'time,phase,gpu,window,hidden_slots,process,type,pid,working_set_mb,private_mb'

export type CsvContext = { phase: string; gpu: boolean; window: string; hiddenSlots: string[] }

/** Uma linha por processo + uma linha TOTAL. */
export function toCsvRows(sample: MemorySample, ctx: CsvContext): string[] {
  const time = new Date(sample.at).toISOString()
  const prefix = [time, ctx.phase, ctx.gpu ? 'on' : 'off', ctx.window, ctx.hiddenSlots.join(' ') || '-']
  const cell = (value: string) => (/[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  const row = (label: string, type: string, pid: number | string, ws: number, priv?: number) =>
    [...prefix, label, type, pid, ws, priv ?? ''].map((v) => cell(String(v))).join(',')
  return [
    ...sample.processes.map((p) => row(p.label, p.type, p.pid, p.workingSetMb, p.privateMb)),
    row('TOTAL', '-', '-', sample.total.workingSetMb, sample.total.privateMb),
  ]
}
