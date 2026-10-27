import { createWriteStream, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { RecorderState } from '../../shared/ipc'
import { log, logDir } from '../logger'

// Spike S4: grava as mensagens WebSocket dos slots (somente leitura) para descobrir
// como o servidor descreve drops, shinies e capturas. O arquivo pode conter dados
// da conta: fica só em logs/ no PC.

const MAX_BYTES = 200 * 1024 * 1024

export class WsRecorder {
  private readonly onChange: () => void
  private stream: WriteStream | null = null
  private file: string | undefined
  private bytes = 0

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  state(): RecorderState {
    return { active: this.stream !== null, bytes: this.bytes, file: this.file }
  }

  start(): void {
    if (this.stream) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.file = join(logDir(), `s4-ws-${stamp}.jsonl`)
    this.stream = createWriteStream(this.file)
    this.bytes = 0
    log(`gravação WS iniciada: ${this.file}`)
    this.onChange()
  }

  stop(reason = 'manual'): void {
    if (!this.stream) return
    this.stream.end()
    this.stream = null
    log(`gravação WS parada (${reason}), ${(this.bytes / 1024 / 1024).toFixed(1)} MB`)
    this.onChange()
  }

  socketOpened(slot: string, ws: string, url: string): void {
    this.write({ slot, dir: 'open', ws, url })
  }

  frame(slot: string, dir: 'in' | 'out', ws: string, opcode: number, data: string): void {
    this.write({ slot, dir, ws, op: opcode, len: data.length, data })
  }

  mark(text: string): void {
    this.write({ slot: '*', dir: 'mark', text })
    log(`marcação: ${text}`)
  }

  private write(entry: Record<string, unknown>): void {
    if (!this.stream) return
    const line = `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`
    this.stream.write(line)
    this.bytes += line.length
    if (this.bytes > MAX_BYTES) this.stop('limite de 200 MB')
  }
}
