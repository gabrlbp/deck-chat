export type OfficialTwitch = { login: string; aoVivo?: boolean; ativo?: boolean; espectadores?: number }

/**
 * Quais lives ficam abertas na fase do S8: só canais com as recompensas do jogo (`ativo`). Para a medição
 * ficar limpa, quem já está aberta continua enquanto estiver ao vivo; as vagas livres vão para os mais assistidos.
 */
export function pickWatched(officials: OfficialTwitch[], current: string[], lives: number): string[] {
  const live = officials.filter((o) => o.aoVivo === true && o.ativo === true)
  const keep = live.filter((o) => current.includes(o.login)).map((o) => o.login)
  const fill = live
    .filter((o) => !keep.includes(o.login))
    .sort((a, b) => (b.espectadores ?? 0) - (a.espectadores ?? 0))
    .map((o) => o.login)
  return [...keep, ...fill].slice(0, lives)
}
