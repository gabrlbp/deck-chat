import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../logger'

export type StoredTokens = { login: string; accessToken: string; refreshToken: string }

// No Windows o safeStorage usa a DPAPI (ligada ao usuário do Windows).
// Sem criptografia disponível (alguns Linux sem keyring), cai para texto puro com aviso.
const encryptedPath = () => join(app.getPath('userData'), 'twitch.bin')
const plainPath = () => join(app.getPath('userData'), 'twitch.json')

export function loadTokens(): StoredTokens | null {
  try {
    if (existsSync(encryptedPath()) && safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(readFileSync(encryptedPath()))) as StoredTokens
    }
    if (existsSync(plainPath())) return JSON.parse(readFileSync(plainPath(), 'utf8')) as StoredTokens
  } catch (err) {
    log(`tokens da Twitch ilegíveis, será preciso conectar de novo: ${String(err)}`)
  }
  return null
}

export function saveTokens(tokens: StoredTokens): void {
  const json = JSON.stringify(tokens)
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(encryptedPath(), safeStorage.encryptString(json))
    rmSync(plainPath(), { force: true })
  } else {
    log('aviso: criptografia indisponível, token da Twitch salvo sem criptografia')
    writeFileSync(plainPath(), json, { mode: 0o600 })
  }
}

export function deleteTokens(): void {
  rmSync(encryptedPath(), { force: true })
  rmSync(plainPath(), { force: true })
}
