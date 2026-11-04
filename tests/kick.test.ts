import { describe, expect, it, vi } from 'vitest'

// spikeLog importa o logger, que importa o electron; aqui só interessa a função pura
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { redactSecrets } from '../src/main/diagnostics/spikeLog'
import { canRedeem, MAX_REDEEMS_PER_HOUR, pickChannel, pickTarget, ulid } from '../src/main/kick/redeem'
import { planLives, pointsLeft, type FarmChannel } from '../src/main/kick/select'
import { lowestQualityOnly } from '../src/main/live/hls'
import { parsePointsGain } from '../src/main/twitch/points'

const channel = (slug: string, points: number | null, extra: Partial<FarmChannel> = {}): FarmChannel => ({
  slug,
  live: true,
  points,
  cooling: false,
  ...extra,
})

describe('Kick: quanto falta para a meta', () => {
  it('com bônus-alvo, é o custo dele', () => {
    expect(pointsLeft(280, 300)).toBe(20)
    expect(pointsLeft(760, 500)).toBe(0)
    expect(pointsLeft(null, 300)).toBe(300)
  })

  it('só avisando, são os custos dos bônus e depois cada milhar', () => {
    expect([0, 300, 500, 1000, 2500].map((p) => pointsLeft(p, null))).toEqual([300, 200, 500, 1000, 500])
  })
})

describe('Kick: quais lives ficam abertas', () => {
  it('vagas vão para o canal ao vivo mais perto da meta', () => {
    const channels = [channel('a', 50), channel('b', 280), channel('c', 200), channel('off', 299, { live: false })]
    expect(planLives(channels, [], 2, 300)).toEqual(['b', 'c'])
  })

  it('não troca por pouca diferença: a troca perde o aquecimento', () => {
    const channels = [channel('aberta', 250), channel('outra', 270)]
    expect(planLives(channels, ['aberta'], 1, 300)).toEqual(['aberta'])
  })

  it('troca quando a diferença compensa', () => {
    const channels = [channel('aberta', 100), channel('outra', 280)]
    expect(planLives(channels, ['aberta'], 1, 300)).toEqual(['outra'])
  })

  it('fecha a live que acabou ou que está de castigo, e respeita 0 vagas', () => {
    const channels = [channel('a', 100, { live: false }), channel('b', 100, { cooling: true }), channel('c', 0)]
    expect(planLives(channels, ['a', 'b'], 2, null)).toEqual(['c'])
    expect(planLives(channels, ['c'], 0, null)).toEqual([])
  })
})

describe('Kick: resgate', () => {
  const now = 1_000_000
  const hour = 60 * 60_000

  it('"nenhum" não mira nada e "um" mira sempre o escolhido', () => {
    expect(pickTarget({ redeem: 'none', redeemType: 'xp' }, {}, now)).toBeNull()
    expect(pickTarget({ redeem: 'one', redeemType: 'shiny' }, { shiny: now + 9 * hour }, now)).toBe('shiny')
  })

  it('"todos" mira o bônus com menos tempo restante, para Captura e Shiny também saírem', () => {
    const config = { redeem: 'all', redeemType: 'xp' } as const
    expect(pickTarget(config, {}, now)).toBe('xp')
    expect(pickTarget(config, { xp: now + hour }, now)).toBe('captura')
    expect(pickTarget(config, { xp: now + hour, captura: now + hour }, now)).toBe('shiny')
    expect(pickTarget(config, { xp: now + 2 * hour, captura: now + hour, shiny: now + 3 * hour }, now)).toBe('captura')
    // bônus vencido conta como sem tempo, mesmo com o horário antigo ainda no bloco
    expect(pickTarget(config, { xp: now - hour, captura: now + hour, shiny: now + hour }, now)).toBe('xp')
  })

  it('paga com o menor saldo suficiente', () => {
    const balances = [
      { slug: 'mecmeno', points: 760 },
      { slug: 'patopapao2', points: 511 },
      { slug: 'yetz', points: 50 },
      { slug: 'nunca-lido', points: null },
    ]
    expect(pickChannel(balances, 500)).toBe('patopapao2')
    expect(pickChannel(balances, 1000)).toBeNull()
  })

  it('freio: no máximo 6 resgates por hora', () => {
    const history = Array.from({ length: MAX_REDEEMS_PER_HOUR }, (_, i) => now - i * 60_000)
    expect(canRedeem(history, now)).toBe(false)
    expect(canRedeem(history, now + hour)).toBe(true)
    expect(canRedeem([], now)).toBe(true)
  })

  it('transaction_id no formato ULID, começando pelo horário', () => {
    // valor de referência da especificação do ULID
    expect(ulid(1469918176385, new Uint8Array(10)).slice(0, 10)).toBe('01ARYZ6S41')
    expect(ulid(Date.now())).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})

describe('Vídeo da live', () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,VIDEO="1080p60"',
    '1080p60/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,VIDEO="160p"',
    '160p/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=852x480,VIDEO="480p"',
    '480p/index.m3u8',
  ].join('\n')

  it('playlist mestre fica só com a menor qualidade', () => {
    expect(lowestQualityOnly(master)).toBe(
      [
        '#EXTM3U',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,VIDEO="160p"',
        '160p/index.m3u8',
        '',
      ].join('\n'),
    )
  })

  it('playlist de segmentos (uma qualidade só) passa sem mexer', () => {
    expect(lowestQualityOnly('#EXTM3U\n#EXTINF:2.0,\nseg1.ts\n')).toBeNull()
  })
})

describe('Gravações dos spikes', () => {
  it('tira JWTs e campos sensíveis, inclusive em JSON dentro de JSON', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3NDM5In0.gGSWUWHZJ8KEWnKZ6Yde'
    expect(redactSecrets(`{"data":{"token":"${jwt}"},"message":"success"}`)).toBe(
      '{"data":{"token":"[removido]"},"message":"success"}',
    )
    expect(redactSecrets(`{"x":"prefixo ${jwt} fim"}`)).toBe('{"x":"prefixo [jwt] fim"}')
    expect(redactSecrets('{"email":"alguem@exemplo.com","slug":"x","authToken":"abc123"}')).toBe(
      '{"email":"[removido]","slug":"x","authToken":"[removido]"}',
    )
    expect(redactSecrets('{\\"access_token\\":\\"abc\\",\\"points\\":10}')).toBe(
      '{\\"access_token\\":\\"[removido]\\",\\"points\\":10}',
    )
  })
})

describe('Twitch: ganho de pontos (S8)', () => {
  const inner = {
    type: 'points-earned',
    data: {
      timestamp: '2026-11-04T20:00:00Z',
      channel_id: '123',
      point_gain: { total_points: 50, reason_code: 'CLAIM' },
      balance: { balance: 1200 },
    },
  }

  it('lê o ganho em JSON puro e em JSON escapado', () => {
    const expected = { key: '123|2026-11-04T20:00:00Z|50', points: 50, reason: 'CLAIM', channelId: '123' }
    expect(parsePointsGain(JSON.stringify(inner))).toEqual(expected)
    expect(parsePointsGain(JSON.stringify({ type: 'MESSAGE', data: { message: JSON.stringify(inner) } }))).toEqual(expected)
  })

  it('ignora outros frames', () => {
    expect(parsePointsGain('{"type":"PONG"}')).toBeNull()
  })
})
