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

interface UpdaterAPI {
  onUpdateAvailable: (callback: () => void) => void
  onUpdateDownloaded: (callback: () => void) => void
  installUpdate: () => void
}

interface SelectedTextOptions {
  format?: 'json' | 'text'
  maxLength?: number
}

interface SelectedTextResult {
  success: boolean
  text: string | null
  error: string | null
  length: number
}

interface SelectedTextAPI {
  get: (options?: SelectedTextOptions) => Promise<SelectedTextResult>
  getString: (maxLength?: number) => Promise<string | null>
  hasSelected: () => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI & {
      store: StoreAPI
    }
    api: typeof api & {
      updater: UpdaterAPI
      startKeyListener: () => Promise<boolean>
      stopKeyListener: () => Promise<boolean>
      startNativeRecording: (deviceId: string) => Promise<void>
      stopNativeRecording: () => Promise<void>
      blockKeys: (keys: string[]) => Promise<void>
      unblockKey: (key: string) => Promise<void>
      getBlockedKeys: () => Promise<void>
      onKeyEvent: (callback: (event: KeyEvent) => void) => void
      send: (channel: string, data: any) => void
      on: (channel: string, callback: (...args: any[]) => void) => () => void
      setPillMouseEvents: (
        ignore: boolean,
        options?: { forward?: boolean },
      ) => Promise<void>
      generateNewAuthState: () => Promise<any>
      exchangeAuthCode: (data: any) => Promise<any>
      logout: () => Promise<void>
      notes: {
        getAll: () => Promise<Note[]>
        add: (note: any) => Promise<Note>
        updateContent: (id: string, content: string) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      dictionary: {
        getAll: () => Promise<any[]>
        add: (item: any) => Promise<any>
        update: (
          id: string,
          word: string,
          pronunciation: string | null,
        ) => Promise<void>
        delete: (id: string) => Promise<void>
      }
      interactions: {
        getAll: () => Promise<any[]>
        getById: (id: string) => Promise<any>
        delete: (id: string) => Promise<void>
      }
      loginItem: {
        setSettings: (enabled: boolean) => Promise<void>
        getSettings: () => Promise<Electron.LoginItemSettings>
      }
      dock: {
        setVisibility: (visible: boolean) => Promise<void>
        getVisibility: () => Promise<{ isVisible: boolean }>
      }
      notifySettingsUpdate: (settings: any) => void
      notifyOnboardingUpdate: (onboarding: any) => void
      notifyUserAuthUpdate: (authUser: any) => void

      getOnboardingState: () => Promise<{
        onboardingStep?: number
        onboardingCompleted?: boolean
      } | null>

      // Analytics device ID methods
      'analytics:get-device-id': () => Promise<string | undefined>

      // Analytics service methods
      'analytics:initialize': (deviceId: string) => Promise<boolean>
      'analytics:enable': (deviceId: string) => Promise<boolean>
      'analytics:disable': () => Promise<void>
      'analytics:is-enabled': () => Promise<boolean>
      'analytics:identify-user': (
        userId: string,
        properties?: any,
        provider?: string,
      ) => Promise<void>
      'analytics:update-user-properties': (properties: any) => Promise<void>
      'analytics:track': (eventName: string, properties?: any) => Promise<void>
      'analytics:reset-user': () => Promise<void>
      'analytics:get-session-duration': () => Promise<number>
      'analytics:is-user-identified': () => Promise<boolean>
      'analytics:get-device-id-cached': () => Promise<string | null>
      'analytics:update-settings': (
        shareAnalytics: boolean,
        deviceId: string,
      ) => Promise<void>

      notifyLoginSuccess: (
        profile: any,
        idToken: string | null,
        accessToken: string | null,
      ) => Promise<void>
      deleteUserData: () => Promise<void>
      selectedText: SelectedTextAPI
    }
  }
}
