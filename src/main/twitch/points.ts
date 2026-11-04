/** Spike S8: um ganho de pontos lido das mensagens que a página da Twitch recebe. */
export type PointsGain = { key: string; points: number; reason: string; channelId: string }

// os frames trazem JSON dentro de JSON, então as aspas podem vir escapadas
const field = (data: string, name: string, value: string) =>
  new RegExp(`\\\\*"${name}\\\\*"\\s*:\\s*\\\\*"?(${value})`).exec(data)?.[1]

/** `null` = o frame não é um ganho de pontos. A mesma mensagem chega a todas as páginas abertas: `key` serve para contar uma vez só. */
export function parsePointsGain(data: string): PointsGain | null {
  if (!data.includes('points-earned')) return null
  const points = field(data, 'total_points', '\\d+')
  if (points === undefined) return null
  const channelId = field(data, 'channel_id', '\\d+') ?? '?'
  const timestamp = field(data, 'timestamp', '[^"\\\\]+') ?? ''
  return {
    key: `${channelId}|${timestamp}|${points}`,
    points: Number(points),
    reason: field(data, 'reason_code', '[A-Z_]+') ?? '?',
    channelId,
  }
}
