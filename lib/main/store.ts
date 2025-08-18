import Store from 'electron-store'
import crypto from 'crypto'
import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults.js'
import { STORE_KEYS } from '../constants/store-keys'
import type { LlmSettings } from '@/app/store/useAdvancedSettingsStore'
import { ItoMode } from '@/app/generated/ito_pb.js'

export interface KeyboardShortcutConfig {
  id: string
  keys: string[]
  mode: ItoMode
}

interface MainStore {
  navExpanded: boolean
}
interface OnboardingStore {
  onboardingStep: number
  onboardingCompleted: boolean
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
  isShortcutGloballyEnabled: boolean
  keyboardShortcuts: KeyboardShortcutConfig[]
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
  llm: LlmSettings
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
  appliedMigrations: string[]
}

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

export const getCurrentUserId = (): string | undefined => {
  const user = store.get(STORE_KEYS.USER_PROFILE) as any
  return user?.id
}
export const getAdvancedSettings = (): AdvancedSettings => {
  return store.get(STORE_KEYS.ADVANCED_SETTINGS) as AdvancedSettings
}

export const defaultValues: AppStore = {
  onboarding: { onboardingStep: 0, onboardingCompleted: false },
  settings: {
    shareAnalytics: true,
    launchAtLogin: true,
    showItoBarAlways: true,
    showAppInDock: true,
    interactionSounds: false,
    muteAudioWhenDictating: false,
    microphoneDeviceId: 'default',
    microphoneName: 'Auto-detect',
    isShortcutGloballyEnabled: false,
    keyboardShortcuts: [
      { id: crypto.randomUUID(), keys: ['fn'], mode: ItoMode.TRANSCRIBE },
      { id: crypto.randomUUID(), keys: ['control'], mode: ItoMode.EDIT },
    ],
    firstName: '',
    lastName: '',
    email: '',
  },
  main: { navExpanded: true },
  auth: { user: null, tokens: null, state: createNewAuthState() },
  advancedSettings: {
    llm: {
      asrProvider: DEFAULT_ADVANCED_SETTINGS.asrProvider,
      asrModel: DEFAULT_ADVANCED_SETTINGS.asrModel,
      asrPrompt: DEFAULT_ADVANCED_SETTINGS.asrPrompt,
      llmProvider: DEFAULT_ADVANCED_SETTINGS.llmProvider,
      llmTemperature: DEFAULT_ADVANCED_SETTINGS.llmTemperature,
      llmModel: DEFAULT_ADVANCED_SETTINGS.llmModel,
      transcriptionPrompt: DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
      editingPrompt: DEFAULT_ADVANCED_SETTINGS.editingPrompt,
      noSpeechThreshold: DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
      lowQualityThreshold: DEFAULT_ADVANCED_SETTINGS.lowQualityThreshold,
    },
  },
  openMic: false,
  selectedAudioInput: null,
  interactionSounds: false,
  userProfile: null,
  idToken: null,
  accessToken: null,
  appliedMigrations: [],
}

export const store = new Store<AppStore>({
  defaults: defaultValues,
})

type Migration = { id: string; run: (s: Store<AppStore>) => void }

const migrations: Migration[] = [
  {
    id: '2025-08-15-keyboard-shortcut-rename',
    run: s => {
      const settings: any = s.get('settings') || {}
      const legacy = settings.keyboardShortcut
      const hasLegacy = Array.isArray(legacy) && legacy.length > 0
      const hasNew =
        Array.isArray(settings.keyboardShortcuts) &&
        settings.keyboardShortcuts.length > 0

      if (!hasNew && hasLegacy) {
        s.set('settings.keyboardShortcuts', [
          {
            id: crypto.randomUUID(),
            keys: legacy,
            mode: ItoMode.TRANSCRIBE,
          },
        ])
      }
      if ('keyboardShortcut' in settings) {
        delete settings.keyboardShortcut
        s.set('settings', settings)
      }
    },
  },
]

// ---------- Migration runner ----------
function runMigrations(s: Store<AppStore>, allMigrations: Migration[]) {
  const applied = new Set(s.get('appliedMigrations') || [])
  for (const m of allMigrations) {
    if (!applied.has(m.id)) {
      console.log(`[migrations] Running: ${m.id}`)
      try {
        m.run(s)
        applied.add(m.id)
      } catch (err) {
        console.error(`[migrations] Failed: ${m.id}`, err)
      }
    }
  }
  s.set('appliedMigrations', Array.from(applied))
}

// Run migrations in production, but allow tests to skip this
if (process.env.NODE_ENV !== 'test') {
  runMigrations(store, migrations)
}

function ensureDefaultsDeep<T = unknown>(
  s: Store<any>,
  defaults: T,
  basePath = '',
  exclude: Set<string> = new Set(['appliedMigrations']), // skip internal/meta keys
) {
  const isObj = (v: any) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

  for (const [key, defaultValue] of Object.entries(defaults as any)) {
    if (exclude.has(key)) continue

    const path = basePath ? `${basePath}.${key}` : key
    const currentValue = s.get(path)

    // Primitives or arrays: set only if truly missing/undefined
    if (!isObj(defaultValue)) {
      if (currentValue === undefined) s.set(path, defaultValue)
      continue
    }

    // Objects:
    if (currentValue === undefined || !isObj(currentValue)) {
      // If missing or wrong shape, seed the whole object from defaults
      s.set(path, defaultValue)
    } else {
      // Recurse to fill only missing leaves
      ensureDefaultsDeep(s, defaultValue, path, exclude)
    }
  }
}
ensureDefaultsDeep(store, defaultValues)

export default store
