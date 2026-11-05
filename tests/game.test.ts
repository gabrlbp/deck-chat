import { describe, expect, it } from 'vitest'
import { SlotGame, ballsLeft } from '../src/main/game/GameState'
import { decode, type BattleEvent } from '../src/main/game/messages'
import { battleDrafts } from '../src/main/game/parser'

// Exemplos reais do spike S4 (28/10/2026), com nicks trocados.
const batalha = (ev: unknown[]) => JSON.stringify({ t: 'batalha', ev })
const estado = (e: Record<string, unknown>) => JSON.stringify({ t: 'estado', estado: e })

function battle(raw: string): BattleEvent[] {
  const msg = decode(raw)
  if (msg?.t !== 'batalha') throw new Error(`esperava batalha, veio ${msg?.t}`)
  return msg.ev
}

describe('decode', () => {
  it('ignora o que não é mensagem do jogo', () => {
    expect(decode('not json')).toBeNull()
    expect(decode('[1,2]')).toBeNull()
    expect(decode('{"sem":"tipo"}')).toBeNull()
  })

  it('tipos sem interesse viram "outro"', () => {
    expect(decode('{"t":"pong"}')).toEqual({ t: 'outro', tipo: 'pong' })
    expect(decode('{"t":"chat","texto":"oi"}')).toEqual({ t: 'outro', tipo: 'chat' })
  })

  it('descarta só os eventos de batalha desconhecidos ou malformados', () => {
    const ev = battle(
      batalha([
        { k: 'ataque', por: 'jogador', golpe: 'Investida', dano: 140 },
        { k: 'fugiu', nome: 'Squirtle', level: 20, shiny: false },
        { k: 'capturado', pokemon: { level: 20 } },
      ]),
    )
    expect(ev).toEqual([{ k: 'fugiu', nome: 'Squirtle', level: 20, shiny: false }])
  })

  it('campo de estado com tipo inesperado não derruba a mensagem', () => {
    const msg = decode(estado({ nick: 'AltTeste', level: 'quarenta e quatro' }))
    expect(msg).toMatchObject({ t: 'estado', estado: { nick: 'AltTeste', level: undefined } })
  })
})

describe('battleDrafts', () => {
  it('drop de uma morte', () => {
    const ev = battle(
      batalha([
        {
          k: 'morte',
          quem: 'selvagem',
          slot: 1062,
          nome: 'Charmander',
          xp: 248,
          ouro: 251,
          drops: [{ nome: 'Fire Stone', qtd: 1 }],
        },
      ]),
    )
    expect(battleDrafts(ev)).toEqual([{ kind: 'drop', title: 'Fire Stone', detail: 'de Charmander' }])
  })

  it('morte sem drop não gera evento; drop múltiplo mostra a quantidade', () => {
    const ev = battle(
      batalha([
        { k: 'morte', nome: 'Charmander', drops: [] },
        { k: 'morte', nome: 'Boss', drops: [{ nome: 'Fragmento de Chave', qtd: 2 }] },
      ]),
    )
    expect(battleDrafts(ev)).toEqual([{ kind: 'drop', title: '2× Fragmento de Chave', detail: 'de Boss' }])
  })

  it('captura comum com os dados do Pokémon', () => {
    const ev = battle(
      batalha([
        {
          k: 'capturado',
          pokemon: {
            id: 62844271,
            nome: 'Charmander',
            level: 20,
            shiny: false,
            quality: 1.399,
            speciesId: 4,
            potencia: 2,
            ivs: { hp: 1, atk: 31, def: 10, spAtk: 4, spDef: 9, speed: 28 },
          },
          paraDepot: true,
        },
      ]),
    )
    expect(battleDrafts(ev)).toEqual([
      {
        kind: 'capture',
        title: 'Capturou Charmander',
        detail: 'Nv 20 · quality 1.40 · potência 2 · IVs 1/31/10/4/9/28',
      },
    ])
  })

  it('shiny capturado, fugido e aparecido', () => {
    const ev = battle(
      batalha([
        { k: 'capturado', pokemon: { nome: 'Gengar', level: 40, shiny: true } },
        { k: 'fugiu', nome: 'Numel', level: 40, shiny: true },
        { k: 'fugiu', nome: 'Squirtle', level: 20, shiny: false },
        { k: 'spawn', nome: 'Snover', level: 40, looktype: 70459 },
        { k: 'spawn', nome: 'Charmander', level: 20, looktype: 60004 },
      ]),
    )
    expect(battleDrafts(ev).map((d) => [d.kind, d.title])).toEqual([
      ['shiny', 'Shiny capturado: Gengar'],
      ['shiny', 'Shiny fugiu: Numel'],
      ['shiny', 'Shiny apareceu: Snover'],
    ])
  })
})

describe('SlotGame', () => {
  const apply = (game: SlotGame, e: Record<string, unknown>) => {
    const msg = decode(estado(e))
    if (msg?.t !== 'estado') throw new Error('esperava estado')
    return game.apply(msg.estado)
  }

  it('junta os estados parciais', () => {
    const game = new SlotGame()
    apply(game, { nick: 'AltTeste', huntSlug: 'charmander', level: 44 })
    apply(game, { balls: { '1': 0, '4': 14010 }, automation: { ballIds: [1, 4], autoPotion: true } })
    apply(game, { xp: 123 })
    expect(game.snapshot).toMatchObject({ nick: 'AltTeste', hunt: 'charmander', level: 44, ballIds: [1, 4] })
    expect(ballsLeft(game.snapshot)).toBe(14010)
  })

  it('conta só as bolas que a automação usa', () => {
    expect(ballsLeft({ balls: { '1': 5, '4': 10, '9': 99 }, ballIds: [1, 4] })).toBe(15)
    expect(ballsLeft({ balls: { '1': 5, '4': 10 } })).toBe(15)
    expect(ballsLeft({})).toBeUndefined()
  })

  it('avisa uma vez quando as pokébolas acabam', () => {
    const game = new SlotGame()
    apply(game, { automation: { ballIds: [4] }, balls: { '4': 1 } })
    expect(apply(game, { balls: { '4': 0 } })).toMatchObject([{ kind: 'problem', title: 'Acabaram as pokébolas' }])
    expect(apply(game, { balls: { '4': 0 } })).toEqual([])
  })

  it('avisa ao ir para o Centro Pokémon, mas não se já estava lá ao abrir', () => {
    const game = new SlotGame()
    expect(apply(game, { noCentro: true, centroMotivo: 'time derrotado' })).toEqual([])
    apply(game, { noCentro: false })
    expect(apply(game, { noCentro: true, centroMotivo: 'time derrotado' })).toEqual([
      { kind: 'problem', title: 'Foi para o Centro Pokémon', detail: 'time derrotado' },
    ])
  })

  it('guarda o bloco de pontos do canal da Kick', () => {
    const game = new SlotGame()
    game.apply({
      kick: { vinculado: true, login: 'main', bonus: { xp: 1793808753131, captura: 0, shiny: 0 }, oficiais: [{ slug: 'yetz', aoVivo: true, ativo: true }] },
    } as never)
    expect(game.snapshot.kick?.bonus?.xp).toBe(1793808753131)
    expect(game.snapshot.kick?.oficiais?.[0]?.slug).toBe('yetz')
    // bloco parcial não apaga o resto
    game.apply({ kick: { bonus: { xp: 0 } } } as never)
    expect(game.snapshot.kick?.vinculado).toBe(true)
    expect(game.snapshot.kick?.bonus?.xp).toBe(0)
  })
})
