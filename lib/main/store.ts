import Store from 'electron-store'
import crypto from 'crypto'

interface MainStore {
  navExpanded: boolean
}

interface OnboardingStore {
  onboardingStep: number
  onboardingCompleted: boolean
}

interface SettingsStore {
  shareAnalytics: boolean
  launchAtLogin: boolean
  showItoBarAlways: boolean
  showAppInDock: boolean
  interactionSounds: boolean
  muteAudioWhenDictating: boolean
  microphoneDeviceId: string
  microphoneName: string
  keyboardShortcut: string[]
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

interface AuthUser {
  id: string
  email?: string
  name?: string
  picture?: string
  provider?: string
  lastSignInAt?: string
}

interface AuthTokens {
  access_token?: string
  refresh_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
}

interface AuthStore {
  user: AuthUser | null
  tokens: AuthTokens | null
  state: AuthState
}

interface AppStore {
  main: MainStore
  onboarding: OnboardingStore
  settings: SettingsStore
  auth: AuthStore
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

const store = new Store<AppStore>({
  defaults: {
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
  },
})

// Delete store for testing
// store.clear()

// Log the store to the console
// console.log('store', store.get('auth'))

export default store
