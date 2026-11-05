import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './logger'

/** client id público do login por Device Code, usado até a v0.1.3 */
const OLD_CLIENT_ID = 'qytowkk3g9925962b7fkj697j5a4oo'

/**
 * O app não integra mais com a Twitch: a presença no chat deixou de valer (B3) e as lives saíram
 * (decisão de 05/11/2026). Revoga o token antigo na Twitch, apaga o arquivo e remove a sessão do teste S8.
 * Se a revogação falhar (ex.: sem internet), o token vence sozinho.
 */
export async function removeOldTwitchLogin(): Promise<void> {
  const partition = join(app.getPath('userData'), 'Partitions', 'twitch')
  if (existsSync(partition)) {
    // nada mais abre persist:twitch, então nenhum arquivo está em uso
    rmSync(partition, { recursive: true, force: true })
    log('sessão da Twitch do teste S8 removida')
  }

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
