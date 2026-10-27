/// <reference types="svelte" />
/// <reference types="vite/client" />

import type { DeckApi } from '../../shared/ipc'

declare global {
  interface Window {
    deck: DeckApi
  }
}
