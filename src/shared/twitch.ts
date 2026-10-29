import type { ChannelView, TwitchState } from './ipc'

export const bonusActive = (c: ChannelView, now: number) => c.present && c.bonusAt !== undefined && c.bonusAt <= now

/** Resumo dos canais ligados: usado na barra de cima e na bandeja. */
export function summarize(state: TwitchState, now: number) {
  const enabled = state.channels.filter((c) => c.enabled)
  return {
    total: enabled.length,
    live: enabled.filter((c) => c.live).length,
    bonus: enabled.filter((c) => bonusActive(c, now)).length,
  }
}
