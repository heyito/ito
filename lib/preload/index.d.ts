import { ElectronAPI } from '@electron-toolkit/preload'
import type api from './api'

interface KeyEvent {
  type: 'keydown' | 'keyup'
  key: string
  timestamp: string
  raw_code: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: typeof api & {
      startKeyListener: () => Promise<boolean>
      stopKeyListener: () => Promise<boolean>
      blockKeys: (keys: string[]) => Promise<void>
      unblockKey: (key: string) => Promise<void>
      getBlockedKeys: () => Promise<void>
      onKeyEvent: (callback: (event: KeyEvent) => void) => void
    }
  }
}
