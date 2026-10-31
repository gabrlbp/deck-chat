import { app } from 'electron'
import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MemorySample } from '../../shared/ipc'
import type { MemoryPhase } from '../../shared/schemas'
import { logDir } from '../logger'
import { CSV_HEADER, toCsvRows, toSample, type CsvContext } from './memory'

const SAMPLE_EVERY_MS = 60_000
/** primeira amostra depois que os slots carregaram */
const FIRST_SAMPLE_MS = 30_000

type Options = {
  /** pid → nome legível (interface, slots) */
  knownProcesses: () => Map<number, string>
  context: () => Omit<CsvContext, 'phase'>
  onSample: () => void
}

/** Spike S5: memória de cada processo do app, a cada minuto, em logs/s5-memory.csv. */
export class MemoryMonitor {
  private readonly opts: Options
  private latest: MemorySample | null = null
  private phase: MemoryPhase = '-'

  constructor(opts: Options) {
    this.opts = opts
  }

  start(): void {
    setTimeout(() => {
      this.sample()
      setInterval(() => this.sample(), SAMPLE_EVERY_MS)
    }, FIRST_SAMPLE_MS)
  }

  state() {
    return { phase: this.phase, memory: this.latest }
  }

  setPhase(phase: MemoryPhase): void {
    this.phase = phase
    // amostra na hora, para a troca de fase ficar marcada no CSV
    this.sample()
  }

  private sample(): void {
    this.latest = toSample(app.getAppMetrics(), this.opts.knownProcesses(), Date.now())
    const file = join(logDir(), 's5-memory.csv')
    if (!existsSync(file)) appendFileSync(file, `${CSV_HEADER}\n`)
    const rows = toCsvRows(this.latest, { ...this.opts.context(), phase: this.phase })
    appendFileSync(file, `${rows.join('\n')}\n`)
    this.opts.onSample()
  }
}
