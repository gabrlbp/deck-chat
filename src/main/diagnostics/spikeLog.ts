import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { logDir } from '../logger'

/** acima disso o arquivo vira `<nome>.old.<ext>` (guarda só o anterior) */
const MAX_BYTES = 20 * 1024 * 1024

function rotate(name: string, ext: string): string {
  const file = join(logDir(), `${name}.${ext}`)
  if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(logDir(), `${name}.old.${ext}`))
  return file
}

/** Uma linha JSON em `logs/<nome>.jsonl` (gravações dos spikes S6 e S7). */
export function spikeJsonl(name: string, entry: Record<string, unknown>): void {
  appendFileSync(rotate(name, 'jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
}

/** Linhas em `logs/<nome>.csv`, com cabeçalho quando o arquivo é novo. */
export function spikeCsv(name: string, header: string, rows: string[]): void {
  if (!rows.length) return
  const file = rotate(name, 'csv')
  if (!existsSync(file)) appendFileSync(file, `${header}\n`)
  appendFileSync(file, `${rows.join('\n')}\n`)
}
