import type { ChannelView, TwitchState } from '../../../shared/ipc'

export { summarize } from '../../../shared/twitch'

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type ChannelStatus = { text: string; tone: 'ok' | 'wait' | 'muted' | 'err' }

export function channelStatus(c: ChannelView, state: TwitchState, now: number): ChannelStatus {
  if (!c.enabled) return { text: 'desligado', tone: 'muted' }
  if (state.auth.state !== 'connected') return { text: 'Twitch não conectada', tone: 'muted' }
  if (state.connection !== 'connected') return { text: 'reconectando ao chat…', tone: 'wait' }
  if (!c.present) return { text: 'entrando no chat…', tone: 'wait' }
  if (c.live === false) return { text: 'no chat · offline', tone: 'muted' }
  if (c.live === null) return { text: 'no chat · ao vivo: desconhecido', tone: 'muted' }
  if (c.bonusAt !== undefined && c.bonusAt > now) return { text: `ao vivo · bônus em ${mmss(c.bonusAt - now)}`, tone: 'wait' }
  return { text: 'ao vivo · bônus ativo (estimado)', tone: 'ok' }
}
