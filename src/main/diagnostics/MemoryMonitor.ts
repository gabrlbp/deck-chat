import { app } from 'electron'
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { MemorySample } from '../../shared/ipc'
import { logDir } from '../logger'
import { CSV_HEADER, toCsvRows, toSample, type CsvContext } from './memory'

const SAMPLE_EVERY_MS = 60_000
/** primeira amostra depois que os slots carregaram */
const FIRST_SAMPLE_MS = 30_000
/** o CSV é histórico para análise (como no S5); não precisa de toda amostra */
const CSV_EVERY_SAMPLES = 10
/** acima disso o arquivo vira memory.old.csv (guarda só o anterior) */
const CSV_MAX_BYTES = 5 * 1024 * 1024

type Options = {
  /** pid → nome legível (interface, slots) */
  knownProcesses: () => Map<number, string>
  context: () => CsvContext
  onSample: (sample: MemorySample) => void
}

/** Memória de cada processo do app a cada minuto: tela Sobre, recarregamento por limite (F8) e logs/memory.csv. */
export class MemoryMonitor {
  private readonly opts: Options
  private latest: MemorySample | null = null
  private count = 0

  constructor(opts: Options) {
    this.opts = opts
  }

  start(): void {
    setTimeout(() => {
      this.sample()
      setInterval(() => this.sample(), SAMPLE_EVERY_MS)
    }, FIRST_SAMPLE_MS)
  }

  state(): MemorySample | null {
    return this.latest
  }

  private sample(): void {
    const sample = toSample(app.getAppMetrics(), this.opts.knownProcesses(), Date.now())
    this.latest = sample
    if (this.count++ % CSV_EVERY_SAMPLES === 0) this.appendCsv(sample)
    this.opts.onSample(sample)
  }

  private appendCsv(sample: MemorySample): void {
    const file = join(logDir(), 'memory.csv')
    if (existsSync(file) && statSync(file).size > CSV_MAX_BYTES) renameSync(file, join(logDir(), 'memory.old.csv'))
    if (!existsSync(file)) appendFileSync(file, `${CSV_HEADER}\n`)
    appendFileSync(file, `${toCsvRows(sample, this.opts.context()).join('\n')}\n`)
  }
}
