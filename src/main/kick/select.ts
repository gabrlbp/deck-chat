export type OfficialKick = { slug: string; aoVivo?: boolean; ativo?: boolean }

/**
 * Quais lives ficam abertas na fase. Para a medição ficar limpa, quem já está aberta continua
 * enquanto estiver ao vivo; as vagas livres vão para os oficiais ao vivo, na ordem do jogo.
 * `offline` = a API da Kick disse que a live acabou (vale mais que o jogo, que pode atrasar).
 */
export function pickChannels(officials: OfficialKick[], current: string[], lives: number, offline: Set<string>): string[] {
  const isLive = (o: OfficialKick) => o.aoVivo === true && o.ativo !== false && !offline.has(o.slug)
  const live = new Set(officials.filter(isLive).map((o) => o.slug))
  const keep = current.filter((slug) => live.has(slug)).slice(0, lives)
  const fill = officials.filter((o) => isLive(o) && !keep.includes(o.slug)).map((o) => o.slug)
  return [...keep, ...fill].slice(0, lives)
}
