/** Medido no S1: 3:40 até o bônus ativar; 4:00 dá uma folga. */
export const BONUS_DELAY_MS = 4 * 60_000

export type ChannelEntry = { login: string; nome: string; source: 'oficial' | 'extra'; enabled: boolean }

/** Oficiais (na ordem do jogo) + extras manuais que não são oficiais. */
export function mergeChannels(
  official: { login: string; nome: string }[],
  extras: string[],
  disabled: string[],
): ChannelEntry[] {
  const off = new Set(disabled)
  const seen = new Set<string>()
  const out: ChannelEntry[] = []
  for (const c of official) {
    if (seen.has(c.login)) continue
    seen.add(c.login)
    out.push({ login: c.login, nome: c.nome, source: 'oficial', enabled: !off.has(c.login) })
  }
  for (const login of extras) {
    if (seen.has(login)) continue
    seen.add(login)
    out.push({ login, nome: login, source: 'extra', enabled: !off.has(login) })
  }
  return out
}

export function bonusAt(joinedAt: number | undefined, liveSince: number | undefined): number | undefined {
  if (joinedAt === undefined || liveSince === undefined) return undefined
  return Math.max(joinedAt, liveSince) + BONUS_DELAY_MS
}

/** Lembra desde quando cada canal aparece como ao vivo na lista do jogo. */
export class LiveTracker {
  private since = new Map<string, { since: number; viewers?: number }>()
  private known = false

  update(lives: { login: string; espectadores?: number }[], now: number): void {
    this.known = true
    const next = new Map<string, { since: number; viewers?: number }>()
    for (const live of lives) {
      const login = live.login.toLowerCase()
      next.set(login, { since: this.since.get(login)?.since ?? now, viewers: live.espectadores })
    }
    this.since = next
  }

  /** `null` enquanto nenhum slot informou quem está ao vivo. */
  get(login: string): { live: boolean | null; since?: number; viewers?: number } {
    if (!this.known) return { live: null }
    const entry = this.since.get(login)
    return entry ? { live: true, since: entry.since, viewers: entry.viewers } : { live: false }
  }
}
