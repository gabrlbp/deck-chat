import { describe, expect, it } from 'vitest'
import { BONUS_DELAY_MS, LiveTracker, bonusAt, mergeChannels } from '../src/main/twitch/channels'
import { channelOf, nickOf, parseIrc } from '../src/main/twitch/irc'

describe('parseIrc', () => {
  it('JOIN da própria conta', () => {
    const msg = parseIrc(':gbr_main!gbr_main@gbr_main.tmi.twitch.tv JOIN #axtlol')
    expect(msg.command).toBe('JOIN')
    expect(nickOf(msg)).toBe('gbr_main')
    expect(channelOf(msg)).toBe('axtlol')
  })

  it('tags, prefixo e trailing', () => {
    const msg = parseIrc('@emote-only=1;room-id=12826;slow=5 :tmi.twitch.tv ROOMSTATE #twitch')
    expect(msg.tags).toMatchObject({ 'emote-only': '1', 'room-id': '12826', slow: '5' })
    expect(msg.command).toBe('ROOMSTATE')
    expect(msg.params).toEqual(['#twitch'])
  })

  it('PING e NOTICE de autenticação', () => {
    expect(parseIrc('PING :tmi.twitch.tv')).toMatchObject({ command: 'PING', params: ['tmi.twitch.tv'] })
    const notice = parseIrc(':tmi.twitch.tv NOTICE * :Login authentication failed')
    expect(notice.command).toBe('NOTICE')
    expect(notice.params).toEqual(['*', 'Login authentication failed'])
  })
})

describe('mergeChannels', () => {
  const official = [
    { login: 'axtlol', nome: 'aXtLOL' },
    { login: 'cogu', nome: 'cogu' },
  ]

  it('oficiais na ordem do jogo, depois extras; desligados marcados', () => {
    expect(mergeChannels(official, ['meucanal', 'cogu'], ['cogu'])).toEqual([
      { login: 'axtlol', nome: 'aXtLOL', source: 'oficial', enabled: true },
      { login: 'cogu', nome: 'cogu', source: 'oficial', enabled: false },
      { login: 'meucanal', nome: 'meucanal', source: 'extra', enabled: true },
    ])
  })
})

describe('bônus', () => {
  it('conta a partir do que vier por último: entrada no chat ou início da live', () => {
    expect(bonusAt(1000, 5000)).toBe(5000 + BONUS_DELAY_MS)
    expect(bonusAt(9000, 5000)).toBe(9000 + BONUS_DELAY_MS)
    expect(bonusAt(undefined, 5000)).toBeUndefined()
    expect(bonusAt(1000, undefined)).toBeUndefined()
  })

  it('LiveTracker lembra desde quando o canal está ao vivo', () => {
    const tracker = new LiveTracker()
    expect(tracker.get('cogu')).toEqual({ live: null })

    tracker.update([{ login: 'cogu', espectadores: 313 }], 1000)
    tracker.update([{ login: 'Cogu', espectadores: 320 }], 2000)
    expect(tracker.get('cogu')).toEqual({ live: true, since: 1000, viewers: 320 })
    expect(tracker.get('axtlol')).toEqual({ live: false })

    // saiu do ar e voltou: a contagem recomeça
    tracker.update([], 3000)
    tracker.update([{ login: 'cogu' }], 4000)
    expect(tracker.get('cogu').since).toBe(4000)
  })
})
