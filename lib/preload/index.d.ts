import { ElectronAPI } from '@electron-toolkit/preload'
import type api from './api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: typeof api
  }
}
