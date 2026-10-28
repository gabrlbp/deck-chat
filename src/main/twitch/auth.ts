// OAuth da Twitch por Device Code Flow (client público: sem secret). Validado no spike S1.

/** Client ID do app "deck-chat-gbr" no dev.twitch.tv (Public). Não é segredo. */
export const TWITCH_CLIENT_ID = 'qytowkk3g9925962b7fkj697j5a4oo'
const SCOPES = 'chat:read'
const ID = 'https://id.twitch.tv/oauth2'

export type Tokens = { accessToken: string; refreshToken: string }
export type DeviceCode = {
  deviceCode: string
  userCode: string
  verificationUri: string
  intervalMs: number
  expiresAt: number
}

async function postForm(path: string, body: Record<string, string>) {
  const res = await fetch(`${ID}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, json }
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')

export async function requestDeviceCode(): Promise<DeviceCode> {
  const r = await postForm('device', { client_id: TWITCH_CLIENT_ID, scopes: SCOPES })
  if (!r.ok) throw new Error(`Twitch recusou o pedido de código (${r.status}): ${str(r.json.message)}`)
  return {
    deviceCode: str(r.json.device_code),
    userCode: str(r.json.user_code),
    verificationUri: str(r.json.verification_uri),
    intervalMs: (Number(r.json.interval) || 5) * 1000,
    expiresAt: Date.now() + (Number(r.json.expires_in) || 1800) * 1000,
  }
}

/** Espera o usuário autorizar no navegador. Rejeita se expirar, for negado ou cancelado. */
export async function pollDeviceToken(code: DeviceCode, signal: AbortSignal): Promise<Tokens> {
  let wait = code.intervalMs
  while (Date.now() < code.expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, wait))
    if (signal.aborted) throw new Error('cancelado')
    const r = await postForm('token', {
      client_id: TWITCH_CLIENT_ID,
      scopes: SCOPES,
      device_code: code.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (r.ok) return { accessToken: str(r.json.access_token), refreshToken: str(r.json.refresh_token) }
    const msg = str(r.json.message)
    if (msg === 'authorization_pending') continue
    if (msg === 'slow_down') {
      wait += 5000
      continue
    }
    throw new Error(`autorização falhou: ${msg || r.status}`)
  }
  throw new Error('o código expirou antes da autorização')
}

/** Client público: o refresh token é de uso único; sempre guardar o novo. */
export async function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  const r = await postForm('token', {
    client_id: TWITCH_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  if (!r.ok) return null
  return { accessToken: str(r.json.access_token), refreshToken: str(r.json.refresh_token) }
}

/** A Twitch exige validar o token ao iniciar e a cada hora. `null` = inválido. */
export async function validateToken(accessToken: string): Promise<{ login: string; expiresInMs: number } | null> {
  const res = await fetch(`${ID}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } })
  if (!res.ok) return null
  const json = (await res.json()) as Record<string, unknown>
  return { login: str(json.login), expiresInMs: (Number(json.expires_in) || 0) * 1000 }
}

export async function revokeToken(accessToken: string): Promise<void> {
  await postForm('revoke', { client_id: TWITCH_CLIENT_ID, token: accessToken }).catch(() => undefined)
}
