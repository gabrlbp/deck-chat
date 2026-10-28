import type { SlotSnapshot } from '../../../shared/ipc'
import type { SlotId } from '../../../shared/schemas'

export type Tab = 'accounts' | 'notifications' | 'settings'
export type SettingsSection = 'slots' | 'twitch' | 'about'

export type Modal = { kind: 'slot'; id: SlotId } | { kind: 'clearSession'; id: SlotId }

// Estado global da UI. Exportar o objeto (e só mutar as propriedades) mantém a reatividade
// para quem importa: é o equivalente a um service com signals no Angular.
export const ui = $state<{
  tab: Tab
  settingsSection: SettingsSection
  modal: Modal | null
  snapshots: SlotSnapshot[]
}>({
  tab: 'accounts',
  settingsSection: 'slots',
  modal: null,
  snapshots: [],
})

export function openSettings(section: SettingsSection): void {
  ui.settingsSection = section
  ui.tab = 'settings'
}

/** As views nativas dos jogos ficam por cima de tudo; só aparecem na aba Contas sem modal. */
export const slotsVisible = () => ui.tab === 'accounts' && ui.modal === null

export async function openModal(modal: Modal): Promise<void> {
  // na aba Contas, tira uma "foto" dos jogos para usar de fundo antes de escondê-los (F4.2)
  if (ui.tab === 'accounts' && ui.modal === null) ui.snapshots = await window.deck.slots.capture()
  ui.modal = modal
}

export function closeModal(): void {
  ui.modal = null
  ui.snapshots = []
}
