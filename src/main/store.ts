import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as v from 'valibot'
import { ConfigSchema, DEFAULT_CONFIG, type Config } from '../shared/schemas'
import { log } from './logger'
import { migrateConfig } from './migrations'

const configPath = () => join(app.getPath('userData'), 'config.json')

export function loadConfig(): Config {
  const path = configPath()
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG)

  try {
    const { config, migrated } = migrateConfig(JSON.parse(readFileSync(path, 'utf8')))
    const result = v.safeParse(ConfigSchema, config)
    if (result.success) {
      if (migrated) {
        saveConfig(result.output)
        log(`config migrada para a versão ${result.output.version} (GPU desligada por padrão)`)
      }
      return result.output
    }
    log('config inválida, usando a padrão:', v.summarize(result.issues))
  } catch (err) {
    log('config ilegível, usando a padrão:', String(err))
  }

  // guarda o arquivo ruim para inspeção em vez de sobrescrever
  renameSync(path, `${path}.bad-${Date.now()}`)
  return structuredClone(DEFAULT_CONFIG)
}

export function saveConfig(config: Config): void {
  const path = configPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2))
  renameSync(tmp, path)
}
