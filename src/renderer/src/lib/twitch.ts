import type { ChannelView, TwitchState } from '../../../shared/ipc'

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const bonusActive = (c: ChannelView, now: number) => c.present && c.bonusAt !== undefined && c.bonusAt <= now

export function summarize(state: TwitchState, now: number) {
  const enabled = state.channels.filter((c) => c.enabled)
  return {
    total: enabled.length,
    live: enabled.filter((c) => c.live).length,
    bonus: enabled.filter((c) => bonusActive(c, now)).length,
  }
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
