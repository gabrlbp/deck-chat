import type { Bounds, SlotId } from './schemas'

export const IPC = {
  getState: 'app:getState',
  state: 'app:state',
  openLogs: 'app:openLogs',
  hideToTray: 'app:hideToTray',
  setBounds: 'slots:setBounds',
  setMuted: 'slots:setMuted',
  setEnabled: 'slots:setEnabled',
  setZoom: 'slots:setZoom',
  reload: 'slots:reload',
  setLabel: 'slots:setLabel',
  setVisible: 'slots:setVisible',
  capture: 'slots:capture',
  clearSession: 'slots:clearSession',
} as const

export type SlotStatus = 'loading' | 'ok' | 'error' | 'crashed' | 'unresponsive' | 'disabled'

/** Dados da alt lidos das mensagens do jogo. Ausentes até o jogo enviar. */
export type SlotGameInfo = {
  nick?: string
  level?: number
  hunt?: string
  /** soma das pokébolas que a automação da alt usa */
  balls?: number
  /** mensagens recebidas do servidor por minuto (vigia de saúde) */
  msgsPerMin?: number
}

export type SlotState = {
  id: SlotId
  label: string
  enabled: boolean
  muted: boolean
  zoom: number
  status: SlotStatus
  game: SlotGameInfo
}

export type GameEventKind = 'shiny' | 'drop' | 'capture' | 'problem'

export type GameEvent = {
  id: string
  at: number
  slot: SlotId
  nick?: string
  kind: GameEventKind
  title: string
  detail?: string
}

/** "Foto" de um slot para o fundo do modal rápido (F4.2). */
export type SlotSnapshot = { id: SlotId; dataUrl: string; bounds: Bounds }

export type AppInfo = { version: string; electron: string; dataDir: string }

export type AppState = {
  slots: SlotState[]
  info: AppInfo
}

export interface DeckApi {
  getState(): Promise<AppState>
  /** retorna a função para cancelar a inscrição */
  onState(listener: (state: AppState) => void): () => void
  openLogs(): void
  hideToTray(): void
  slots: {
    setBounds(id: SlotId, bounds: Bounds): void
    setMuted(id: SlotId, muted: boolean): void
    setEnabled(id: SlotId, enabled: boolean): void
    setZoom(id: SlotId, zoom: number): void
    reload(id: SlotId): void
    setLabel(id: SlotId, label: string): void
    /** esconde as views nativas (o jogo continua rodando) para a UI poder ficar por cima */
    setVisible(visible: boolean): void
    capture(): Promise<SlotSnapshot[]>
    clearSession(id: SlotId): Promise<void>
  }
}
