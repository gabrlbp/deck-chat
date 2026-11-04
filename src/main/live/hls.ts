/**
 * Deixa só a menor qualidade (ex.: 160p) na playlist mestre HLS da live: o mesmo que escolher 160p no player.
 * `null` = não é uma playlist mestre com mais de uma qualidade (passa sem mexer).
 *
 * Adaptado do Kickterino (https://github.com/ViinniSantoos/kickterino, licença MIT,
 * © ViinniSantoos): função `lowestQualityOnly` do main.js.
 */
export function lowestQualityOnly(playlist: string): string | null {
  const lines = playlist.split('\n')
  const head: string[] = []
  const variants: [string, string][] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      variants.push([line, lines[i + 1] ?? ''])
      i++
    } else if (!variants.length) {
      head.push(line)
    }
  }
  if (variants.length < 2) return null
  const bandwidth = (l: string) => Number(/BANDWIDTH=(\d+)/.exec(l)?.[1] ?? Infinity)
  variants.sort((a, b) => bandwidth(a[0]) - bandwidth(b[0]))
  const lowest = variants[0]
  if (!lowest) return null
  return `${[...head, ...lowest].join('\n')}\n`
}
