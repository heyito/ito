import { ElectronAPI } from '@electron-toolkit/preload'
import type api from './api'

interface KeyEvent {
  type: 'keydown' | 'keyup'
  key: string
  timestamp: string
  raw_code: number
}

interface StoreAPI {
  get(key: string): any
  set(property: string, val: any): void
}

declare global {
  interface Window {
    electron: ElectronAPI & {
      store: StoreAPI
    }
    api: typeof api & {
      startKeyListener: () => Promise<boolean>
      stopKeyListener: () => Promise<boolean>
      blockKeys: (keys: string[]) => Promise<void>
      unblockKey: (key: string) => Promise<void>
      getBlockedKeys: () => Promise<void>
      onKeyEvent: (callback: (event: KeyEvent) => void) => void
      send: (channel: string, data: any) => void
      on: (channel: string, callback: (...args: any[]) => void) => () => void
    }
  }
}
