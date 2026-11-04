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

/**
 * Tira tokens e dados pessoais de um texto antes de gravar: JWTs e campos sensíveis, com aspas
 * normais ou escapadas (JSON dentro de JSON). A gravação do S6 guardou tokens e e-mail nos corpos.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
    .replace(
      /(\\*"(?:[\w-]*token[\w-]*|authorization|email|password|cookie)\\*"\s*:\s*\\*")[^"\\]*/gi,
      '$1[removido]',
    )
}

/** Uma linha JSON em `logs/<nome>.jsonl` (gravações dos spikes). */
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
