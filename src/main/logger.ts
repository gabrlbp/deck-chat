import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let dirReady = false

export function logDir(): string {
  const dir = join(app.getPath('userData'), 'logs')
  if (!dirReady) {
    mkdirSync(dir, { recursive: true })
    dirReady = true
  }
  return dir
}

export function log(...parts: unknown[]): void {
  const text = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  const line = `${new Date().toISOString()} ${text}`
  console.log(line)
  appendFileSync(join(logDir(), 'deck.log'), `${line}\n`)
}

export function appendCsv(file: string, header: string, row: string): void {
  const path = join(logDir(), file)
  if (!existsSync(path)) appendFileSync(path, `${header}\n`)
  appendFileSync(path, `${row}\n`)
}
