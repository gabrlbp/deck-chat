import type { Bounds, SlotId } from './schemas'

export const IPC = {
  getState: 'app:getState',
  state: 'app:state',
  openLogs: 'app:openLogs',
  hideToTray: 'app:hideToTray',
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
  recorderMark: 'recorder:mark',
  setBounds: 'slots:setBounds',
  setMuted: 'slots:setMuted',
  setEnabled: 'slots:setEnabled',
  setZoom: 'slots:setZoom',
  reload: 'slots:reload',
} as const

export type SlotStatus = 'loading' | 'ok' | 'error' | 'crashed' | 'disabled'

export type WindowMode = 'focused' | 'unfocused' | 'minimized' | 'tray'

/** Amostra do spike S3: o quanto o Chromium está segurando timers e frames do slot. */
export type ProbeSample = {
  at: number
  /** ticks de setInterval(1s) recebidos / esperados. 1 = sem throttling */
  timerRatio: number
  /** frames de requestAnimationFrame por segundo */
  fps: number
  visibility: 'visible' | 'hidden' | 'prerender'
  windowMode: WindowMode
  /** atividade de rede do slot, por minuto */
  httpPerMin: number
  wsSentPerMin: number
  wsRecvPerMin: number
}

export type SlotState = {
  id: SlotId
  label: string
  enabled: boolean
  muted: boolean
  zoom: number
  status: SlotStatus
  title?: string
  probe?: ProbeSample
}

export type RecorderState = { active: boolean; bytes: number; file?: string }

export type AppState = {
  slots: SlotState[]
  windowMode: WindowMode
  logDir: string
  recorder: RecorderState
}

export interface DeckApi {
  getState(): Promise<AppState>
  /** retorna a função para cancelar a inscrição */
  onState(listener: (state: AppState) => void): () => void
  openLogs(): void
  hideToTray(): void
  recorder: {
    start(): void
    stop(): void
    mark(text: string): void
  }
  slots: {
    setBounds(id: SlotId, bounds: Bounds): void
    setMuted(id: SlotId, muted: boolean): void
    setEnabled(id: SlotId, enabled: boolean): void
    setZoom(id: SlotId, zoom: number): void
    reload(id: SlotId): void
  }
}
