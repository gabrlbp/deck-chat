import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './logger'

/** client id público do login por Device Code, usado até a v0.1.3 */
const OLD_CLIENT_ID = 'qytowkk3g9925962b7fkj697j5a4oo'

/**
 * A presença no chat da Twitch deixou de valer (B3, 04/11/2026). O login antigo não serve mais:
 * revoga o token na Twitch e apaga o arquivo. Se falhar (ex.: sem internet), o token vence sozinho.
 */
export async function removeOldTwitchLogin(): Promise<void> {
  const encrypted = join(app.getPath('userData'), 'twitch.bin')
  const plain = join(app.getPath('userData'), 'twitch.json')
  if (!existsSync(encrypted) && !existsSync(plain)) return
  try {
    const raw = existsSync(encrypted) ? safeStorage.decryptString(readFileSync(encrypted)) : readFileSync(plain, 'utf8')
    const { accessToken } = JSON.parse(raw) as { accessToken: string }
    await fetch('https://id.twitch.tv/oauth2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: OLD_CLIENT_ID, token: accessToken }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    log(`não foi possível revogar o login antigo da Twitch: ${String(err)}`)
  }
  rmSync(encrypted, { force: true })
  rmSync(plain, { force: true })
  log('login antigo da Twitch (presença no chat) removido')
}
