import Store from 'electron-store'
import crypto from 'crypto'
import { STORE_KEYS } from '../constants/store-keys'

interface MainStore {
  navExpanded: boolean
}

interface OnboardingStore {
  onboardingStep: number
  onboardingCompleted: boolean
}

export enum KeyboardShortcutMode {
  DICTATION = 'dictation',
  INTELLIGENT = 'intelligent',
}

export interface KeyboardShortcutConfig {
  keys: string[]
  mode: KeyboardShortcutMode
}

export interface SettingsStore {
  shareAnalytics: boolean
  launchAtLogin: boolean
  showItoBarAlways: boolean
  showAppInDock: boolean
  interactionSounds: boolean
  muteAudioWhenDictating: boolean
  microphoneDeviceId: string
  microphoneName: string
  keyboardShortcut: string[]
  isShortcutGloballyEnabled: boolean
  keyboardShortcuts?: KeyboardShortcutConfig[]
  firstName: string
  lastName: string
  email: string
}

export interface AuthState {
  id: string
  codeVerifier: string
  codeChallenge: string
  state: string
}

export interface AuthUser {
  id: string
  email?: string
  name?: string
  picture?: string
  provider?: string
  lastSignInAt?: string
}

export interface AuthTokens {
  access_token?: string
  refresh_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  expires_at?: number
}

export interface AuthStore {
  user: AuthUser | null
  tokens: AuthTokens | null
  state: AuthState
}

export interface AdvancedSettings {
  llm: {
    asrModel: string
  }
}

interface AppStore {
  main: MainStore
  onboarding: OnboardingStore
  settings: SettingsStore
  auth: AuthStore
  advancedSettings: AdvancedSettings
  openMic: boolean
  selectedAudioInput: string | null
  interactionSounds: boolean
  userProfile: any | null
  idToken: string | null
  accessToken: string | null
}

// Helper function to get current user ID
export const getCurrentUserId = (): string | undefined => {
  const user = store.get(STORE_KEYS.USER_PROFILE) as any
  return user?.id
}

// Helper function to get advanced settings
export const getAdvancedSettings = (): AdvancedSettings => {
  return store.get(STORE_KEYS.ADVANCED_SETTINGS) as AdvancedSettings
}

// Helper function to get all active keyboard shortcuts
export const getActiveShortcuts = (): KeyboardShortcutConfig[] => {
  const settings = store.get(STORE_KEYS.SETTINGS) as SettingsStore

  // If new format exists, use it
  if (settings.keyboardShortcuts) {
    return settings.keyboardShortcuts
  }

  // Fallback to legacy format
  if (settings.keyboardShortcut?.length > 0) {
    return [
      {
        keys: settings.keyboardShortcut,
        mode: KeyboardShortcutMode.DICTATION,
      },
    ]
  }

  return []
}

// Generate new auth state with crypto
export const createNewAuthState = (): AuthState => {
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')
  const id = crypto.randomUUID()
  return { id, codeVerifier, codeChallenge, state }
}

const defaultValues: AppStore = {
  onboarding: {
    onboardingStep: 0,
    onboardingCompleted: false,
  },
  settings: {
    shareAnalytics: true,
    launchAtLogin: true,
    showItoBarAlways: true,
    showAppInDock: true,
    interactionSounds: false,
    muteAudioWhenDictating: false,
    microphoneDeviceId: 'default',
    microphoneName: 'Auto-detect',
    keyboardShortcut: ['fn'],
    isShortcutGloballyEnabled: false,
    keyboardShortcuts: [],
    firstName: '',
    lastName: '',
    email: '',
  },
  main: {
    navExpanded: true,
  },
  auth: {
    user: null,
    tokens: null,
    state: createNewAuthState(),
  },
  advancedSettings: {
    llm: {
      asrModel: 'whisper-large-v3',
    },
  },
  openMic: false,
  selectedAudioInput: null,
  interactionSounds: false,
  userProfile: null,
  idToken: null,
  accessToken: null,
}

const store = new Store<AppStore>({
  defaults: defaultValues,
})

// electron quirk -- default values are only used if the entire object is missing.
// We need to manually merge defaults for nested objects to ensure all keys exist.
const currentSettings = store.get(STORE_KEYS.SETTINGS)
const completeSettings = { ...defaultValues.settings, ...currentSettings }
store.set(STORE_KEYS.SETTINGS, completeSettings)

const currentMain = store.get(STORE_KEYS.MAIN)
const completeMain = { ...defaultValues.main, ...currentMain }
store.set(STORE_KEYS.MAIN, completeMain)

const currentOnboarding = store.get(STORE_KEYS.ONBOARDING)
const completeOnboarding = { ...defaultValues.onboarding, ...currentOnboarding }
store.set(STORE_KEYS.ONBOARDING, completeOnboarding)

const currentAuth = store.get(STORE_KEYS.AUTH)
const completeAuth = { ...defaultValues.auth, ...currentAuth }
store.set(STORE_KEYS.AUTH, completeAuth)

const currentAdvancedSettings = store.get(STORE_KEYS.ADVANCED_SETTINGS)
const completeAdvancedSettings = {
  ...defaultValues.advancedSettings,
  ...currentAdvancedSettings,
}
store.set(STORE_KEYS.ADVANCED_SETTINGS, completeAdvancedSettings)

export default store
