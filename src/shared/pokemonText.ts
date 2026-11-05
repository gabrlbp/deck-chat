/** O que dá para tirar do texto de uma ficha do jogo. */
export type ParsedPokemon = {
  name: string
  shiny: boolean
  level?: number
  potencia?: number
  quality?: number
  iv?: number
  nota?: number
}

/** "1.437" e "1,442" são milhares no nível: só importam os dígitos. */
const integer = (text: string | undefined) => {
  const digits = text?.replace(/\D/g, '')
  return digits ? Number(digits) : undefined
}
/** "1,800" e "1.8" são decimais na qualidade e na nota. */
const decimal = (text: string | undefined) => {
  if (!text) return undefined
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) ? value : undefined
}

/** Formato "Copiar p/ ChatGPT" (markdown). */
function parseMarkdown(text: string): ParsedPokemon | null {
  const name = /^- Espécie:\s*(.+?)\s*(?:\(#\d+\))?\s*(?:—.*)?$/m.exec(text)?.[1]
  if (!name) return null
  return {
    name,
    shiny: /^- Shiny:\s*sim/im.test(text),
    level: integer(/^- Nível:\s*([\d.,]+)/m.exec(text)?.[1]),
    potencia: integer(/^- Potência:\s*P(\d)/m.exec(text)?.[1]),
    quality: decimal(/^- Qualidade:\s*([\d.,]+)/m.exec(text)?.[1]),
    iv: integer(/^- IV somado:\s*(\d+)/m.exec(text)?.[1]),
    nota: decimal(/^- Nota da Calculadora:\s*([\d.,]+)/m.exec(text)?.[1]),
  }
}

/** Formato do texto selecionado na tela da ficha. */
function parseScreen(text: string): ParsedPokemon | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const level = lines.findIndex((l) => /^Nv\s*[\d.,]+$/.test(l))
  if (level < 1) return null
  // a linha acima do nível tem o nome: "Mega Aerodactyl+2" (refino) ou "✨ Shiny Dugtrio"
  const title = lines[level - 1] ?? ''
  const shiny = /shiny/i.test(title) || lines.some((l) => /^✨\s*SHINY$/i.test(l))
  const name = title
    .replace(/^✨\s*/, '')
    .replace(/^shiny\s+/i, '')
    .replace(/\+\d+$/, '')
    .trim()
  if (!name) return null
  const after = (label: RegExp) => {
    const i = lines.findIndex((l) => label.test(l))
    return i === -1 ? undefined : lines[i + 1]
  }
  const notaIndex = lines.findIndex((l) => /^\/\s*10/.test(l))
  return {
    name,
    shiny,
    level: integer(lines[level]),
    potencia: integer(/^P(\d)$/.exec(after(/^Potência$/i) ?? '')?.[1]),
    quality: decimal(after(/^qualidade$/i)),
    iv: integer(after(/^IV somado$/i)?.split('/')[0]),
    nota: notaIndex > 0 ? decimal(lines[notaIndex - 1]) : undefined,
  }
}

/** Aceita os dois textos que o jogo oferece. `null` = não reconheceu. */
export function parsePokemonText(text: string): ParsedPokemon | null {
  return parseMarkdown(text) ?? parseScreen(text)
}
