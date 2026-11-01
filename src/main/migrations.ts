const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Converte configs salvas por versões anteriores para o formato atual, antes da validação.
 * Retorna `migrated: true` quando algo mudou (o chamador salva o resultado).
 */
export function migrateConfig(raw: unknown): { config: unknown; migrated: boolean } {
  if (!isRecord(raw) || raw.version !== 1) return { config: raw, migrated: false }

  // v1 → v2: GPU desligada por padrão. O S5 mediu ~800 MB a menos e o jogo ficou normal.
  // A v0.1.1 gravava hardwareAcceleration: true por padrão, então a escolha antiga não é respeitada.
  const system = isRecord(raw.system) ? { ...raw.system, hardwareAcceleration: false } : raw.system
  return { config: { ...raw, version: 2, system }, migrated: true }
}
