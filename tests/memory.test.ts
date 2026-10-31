import { describe, expect, it } from 'vitest'
import { CSV_HEADER, toCsvRows, toSample, type RawMetric } from '../src/main/diagnostics/memory'

const kb = (mb: number) => mb * 1024

const metrics: RawMetric[] = [
  { pid: 1, type: 'Browser', memory: { workingSetSize: kb(120), privateBytes: kb(80) } },
  { pid: 2, type: 'GPU', memory: { workingSetSize: kb(200), privateBytes: kb(150) } },
  { pid: 3, type: 'Tab', memory: { workingSetSize: kb(60), privateBytes: kb(40) } },
  { pid: 4, type: 'Tab', memory: { workingSetSize: kb(300), privateBytes: kb(250) } },
  { pid: 5, type: 'Utility', name: 'Network Service', memory: { workingSetSize: kb(30), privateBytes: kb(10) } },
]
const known = new Map([
  [3, 'interface'],
  [4, 'slot-1 · AltTeste'],
])

describe('toSample', () => {
  it('nomeia os processos, ordena pelo maior e soma', () => {
    const sample = toSample(metrics, known, 0)
    expect(sample.processes.map((p) => p.label)).toEqual([
      'slot-1 · AltTeste',
      'gpu',
      'app (main)',
      'interface',
      'Network Service',
    ])
    expect(sample.total).toEqual({ workingSetMb: 710, privateMb: 530 })
  })

  it('sem privateBytes (fora do Windows) o total privado fica indefinido', () => {
    const sample = toSample([{ pid: 1, type: 'Browser', memory: { workingSetSize: kb(100) } }], new Map(), 0)
    expect(sample.total.privateMb).toBeUndefined()
  })
})

describe('toCsvRows', () => {
  it('uma linha por processo + TOTAL, com o contexto da fase', () => {
    const sample = toSample(metrics.slice(3, 4), known, Date.UTC(2026, 9, 31, 12))
    const rows = toCsvRows(sample, { phase: 'C', gpu: true, window: 'bandeja', hiddenSlots: ['slot-1', 'slot-2'] })
    expect(CSV_HEADER.split(',')).toHaveLength(10)
    expect(rows).toEqual([
      '2026-10-31T12:00:00.000Z,C,on,bandeja,slot-1 slot-2,slot-1 · AltTeste,Tab,4,300,250',
      '2026-10-31T12:00:00.000Z,C,on,bandeja,slot-1 slot-2,TOTAL,-,-,300,250',
    ])
  })
})
