import { describe, expect, it } from 'vitest'
import { isVideoRequest, lowestQualityOnly } from '../src/main/kick/hls'
import { pickChannels } from '../src/main/kick/select'

describe('Kick: escolha das lives da fase (S6)', () => {
  const officials = [
    { slug: 'yetz', aoVivo: true },
    { slug: 'patopapao2', aoVivo: false },
    { slug: 'axt', aoVivo: true },
    { slug: 'rodil', aoVivo: true },
    { slug: 'cogu', aoVivo: true, ativo: false },
  ]

  it('preenche as vagas com os oficiais ao vivo, na ordem do jogo', () => {
    expect(pickChannels(officials, [], 2, new Set())).toEqual(['yetz', 'axt'])
  })

  it('mantém quem já está aberta (medição estável) e ignora canal inativo', () => {
    expect(pickChannels(officials, ['rodil'], 2, new Set())).toEqual(['rodil', 'yetz'])
    expect(pickChannels(officials, [], 5, new Set())).toEqual(['yetz', 'axt', 'rodil'])
  })

  it('troca a live que a API disse que acabou', () => {
    expect(pickChannels(officials, ['yetz', 'axt'], 2, new Set(['axt']))).toEqual(['yetz', 'rodil'])
  })
})

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

describe('Kick: vídeo da live (S6)', () => {
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

  it('reconhece os pedidos de vídeo que a fase "sem vídeo" bloqueia', () => {
    expect(isVideoRequest('https://abc.us-west-2.playback.live-video.net/api/video/v1/x.m3u8?token=1')).toBe(true)
    expect(isVideoRequest('https://video.cdn.example/seg-12.ts')).toBe(true)
    expect(isVideoRequest('https://kick.com/api/v2/channels/yetz')).toBe(false)
    expect(isVideoRequest('https://files.kick.com/images/user/1/profile.webp')).toBe(false)
  })
})
