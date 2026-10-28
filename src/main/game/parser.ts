import type { EventDraft } from './events'
import type { BattleEvent } from './messages'

// Looktype de spawn normal = 60000 + espécie; nos anúncios de shiny aparece 70000 + espécie.
// Hipótese do S4, ainda não confirmada com um shiny de verdade num spawn.
export const SHINY_LOOKTYPE_MIN = 70_000

const IV_ORDER = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'] as const

function pokemonDetail(p: Extract<BattleEvent, { k: 'capturado' }>['pokemon']): string | undefined {
  const parts = [
    p.level !== undefined ? `Nv ${p.level}` : null,
    p.quality !== undefined ? `quality ${p.quality.toFixed(2)}` : null,
    p.potencia !== undefined ? `potência ${p.potencia}` : null,
    p.ivs ? `IVs ${IV_ORDER.map((k) => p.ivs?.[k] ?? '?').join('/')}` : null,
  ].filter((part) => part !== null)
  return parts.length ? parts.join(' · ') : undefined
}

/** Eventos de `batalha` que interessam à aba Notificações (F5.2). */
export function battleDrafts(events: BattleEvent[]): EventDraft[] {
  const drafts: EventDraft[] = []
  for (const ev of events) {
    switch (ev.k) {
      case 'morte':
        for (const drop of ev.drops) {
          drafts.push({
            kind: 'drop',
            title: drop.qtd > 1 ? `${drop.qtd}× ${drop.nome}` : drop.nome,
            detail: ev.nome ? `de ${ev.nome}` : undefined,
          })
        }
        break
      case 'capturado': {
        const p = ev.pokemon
        drafts.push({
          kind: p.shiny ? 'shiny' : 'capture',
          title: p.shiny ? `Shiny capturado: ${p.nome}` : `Capturou ${p.nome}`,
          detail: pokemonDetail(p),
        })
        break
      }
      case 'fugiu':
        if (ev.shiny) {
          drafts.push({
            kind: 'shiny',
            title: `Shiny fugiu: ${ev.nome}`,
            detail: ev.level !== undefined ? `Nv ${ev.level}` : undefined,
          })
        }
        break
      case 'spawn':
        if ((ev.looktype ?? 0) >= SHINY_LOOKTYPE_MIN) {
          drafts.push({ kind: 'shiny', title: `Shiny apareceu: ${ev.nome}`, detail: 'detecção experimental' })
        }
        break
    }
  }
  return drafts
}
