/**
 * Depois que o vigia recarrega um slot, o jogo pode não voltar (ex.: servidor em manutenção, B2).
 * Enquanto nenhuma mensagem chegar, tenta de novo com intervalos crescentes: 3, 6, 12 e depois a cada 15 min.
 */
const RETRY_DELAYS_MS = [3, 6, 12, 15].map((min) => min * 60_000)

/** Espera antes da tentativa seguinte; `attempt` 0 = logo após o recarregamento do vigia. */
export function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 15 * 60_000
}

export type Recovery = { attempt: number; nextAt: number }

export const startRecovery = (now: number): Recovery => ({ attempt: 0, nextAt: now + retryDelay(0) })

/** Próximo passo da recuperação de um slot que ainda não voltou a receber mensagens. */
export function nextRecovery(r: Recovery, now: number): Recovery {
  const attempt = r.attempt + 1
  return { attempt, nextAt: now + retryDelay(attempt) }
}
