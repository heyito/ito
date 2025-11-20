import crypto from 'crypto'
import { STORE_KEYS } from '../constants/store-keys'
import type { LlmSettings } from '@/app/store/useAdvancedSettingsStore'
import { ItoMode } from '@/app/generated/ito_pb.js'
import { ITO_MODE_SHORTCUT_DEFAULTS } from '../constants/keyboard-defaults.js'
import { KeyName, normalizeLegacyKey } from '../types/keyboard.js'
import { KeyValueStore } from './sqlite/repo'
import { resolveDefaultKeys } from '../utils/settings.js'

export interface KeyboardShortcutConfig {
  id: string
  keys: KeyName[]
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
  grammarServiceEnabled: boolean
  defaults?: LlmSettings
  macosAccessibilityContextEnabled: boolean
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
  const storeSettings = store.get(
    STORE_KEYS.ADVANCED_SETTINGS,
  ) as AdvancedSettings
  return { ...storeSettings }
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
      {
        id: crypto.randomUUID(),
        keys: ITO_MODE_SHORTCUT_DEFAULTS[ItoMode.TRANSCRIBE].map(
          normalizeLegacyKey,
        ) as KeyName[],
        mode: ItoMode.TRANSCRIBE,
      },
      {
        id: crypto.randomUUID(),
        keys: ITO_MODE_SHORTCUT_DEFAULTS[ItoMode.EDIT].map(
          normalizeLegacyKey,
        ) as KeyName[],
        mode: ItoMode.EDIT,
      },
    ],
    firstName: '',
    lastName: '',
    email: '',
  },
  main: { navExpanded: true },
  auth: { user: null, tokens: null, state: createNewAuthState() },
  advancedSettings: {
    grammarServiceEnabled: false,
    macosAccessibilityContextEnabled: false,
    llm: {
      asrProvider: null,
      asrModel: null,
      asrPrompt: null,
      llmProvider: null,
      llmTemperature: null,
      llmModel: null,
      transcriptionPrompt: null,
      editingPrompt: null,
      noSpeechThreshold: null,
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

// Lightweight store-like interface used for migrations and defaults logic
type StoreLike<T = any> = {
  get: (path: string) => any
  set: (path: string, value: any) => void
}

// In-memory cache that backs synchronous reads and dot-path writes
const cache: Record<string, any> = {
  [STORE_KEYS.MAIN]: defaultValues.main,
  [STORE_KEYS.ONBOARDING]: defaultValues.onboarding,
  [STORE_KEYS.SETTINGS]: defaultValues.settings,
  [STORE_KEYS.AUTH]: defaultValues.auth,
  [STORE_KEYS.ADVANCED_SETTINGS]: defaultValues.advancedSettings,
  [STORE_KEYS.OPEN_MIC]: defaultValues.openMic,
  [STORE_KEYS.SELECTED_AUDIO_INPUT]: defaultValues.selectedAudioInput,
  [STORE_KEYS.INTERACTION_SOUNDS]: defaultValues.interactionSounds,
  [STORE_KEYS.USER_PROFILE]: defaultValues.userProfile,
  [STORE_KEYS.ID_TOKEN]: defaultValues.idToken,
  [STORE_KEYS.ACCESS_TOKEN]: defaultValues.accessToken,
  appliedMigrations: defaultValues.appliedMigrations,
}

const isObject = (v: any) =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

function deepGet(obj: any, pathParts: string[]): any {
  return pathParts.reduce(
    (acc, part) => (acc == null ? undefined : acc[part]),
    obj,
  )
}

function deepSet(obj: any, pathParts: string[], value: any): any {
  if (pathParts.length === 0) return value
  const [head, ...rest] = pathParts
  const target = isObject(obj) ? obj : {}
  return {
    ...target,
    [head]: rest.length === 0 ? value : deepSet(target[head], rest, value),
  }
}

async function persistTopLevelKey(key: string) {
  try {
    await KeyValueStore.set(key, JSON.stringify(cache[key]))
  } catch (err) {
    console.error('[store] Failed to persist key', key, err)
  }
}

export const store: StoreLike<AppStore> & {
  delete: (key: string) => void
} = {
  get: (path: string) => {
    if (!path || typeof path !== 'string') return undefined
    if (path.includes('.')) {
      const [top, ...rest] = path.split('.')
      const topVal = cache[top]
      return deepGet(topVal, rest)
    }
    return cache[path]
  },
  set: (path: string, value: any) => {
    if (!path || typeof path !== 'string') return
    if (path.includes('.')) {
      const [top, ...rest] = path.split('.')
      const current = cache[top]
      cache[top] = deepSet(current, rest, value)
      void persistTopLevelKey(top)
      return
    }
    cache[path] = value
    void persistTopLevelKey(path)
  },
  delete: (key: string) => {
    if (!key || typeof key !== 'string') return
    delete cache[key]
    KeyValueStore.delete(key).catch(err =>
      console.error('[store] Failed to delete key', key, err),
    )
  },
}

type Migration = { id: string; run: (s: StoreLike<AppStore>) => void }

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
function runMigrations(s: StoreLike<AppStore>, allMigrations: Migration[]) {
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

function ensureDefaultsDeep<T = unknown>(
  s: StoreLike<any>,
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

// Load cached values from SQLite and migrate from legacy electron-store if needed
export async function initializeStore() {
  // 1) Load from SQLite KV for known top-level keys
  const topLevelKeys: string[] = [
    STORE_KEYS.MAIN,
    STORE_KEYS.ONBOARDING,
    STORE_KEYS.SETTINGS,
    STORE_KEYS.AUTH,
    STORE_KEYS.ADVANCED_SETTINGS,
    STORE_KEYS.OPEN_MIC,
    STORE_KEYS.SELECTED_AUDIO_INPUT,
    STORE_KEYS.INTERACTION_SOUNDS,
    STORE_KEYS.USER_PROFILE,
    STORE_KEYS.ID_TOKEN,
    STORE_KEYS.ACCESS_TOKEN,
    'appliedMigrations',
  ]

  for (const key of topLevelKeys) {
    try {
      const str = await KeyValueStore.get(key)
      if (str !== undefined) {
        try {
          cache[key] = JSON.parse(str)
        } catch {
          cache[key] = str
        }
      }
    } catch (err) {
      console.error('[store] Failed loading key from SQLite', key, err)
    }
  }

  // 2) One-time migration from electron-store → SQLite (backwards compatibility)
  try {
    const migrated = await KeyValueStore.get('migration:electron_store_v1_done')
    if (migrated !== 'true') {
      try {
        const { default: LegacyStore } = await import('electron-store')
        const legacy = new LegacyStore<AppStore>({ defaults: defaultValues })
        const migrateKeys = [
          STORE_KEYS.MAIN,
          STORE_KEYS.ONBOARDING,
          STORE_KEYS.SETTINGS,
          STORE_KEYS.AUTH,
          STORE_KEYS.ADVANCED_SETTINGS,
          STORE_KEYS.OPEN_MIC,
          STORE_KEYS.SELECTED_AUDIO_INPUT,
          STORE_KEYS.INTERACTION_SOUNDS,
          STORE_KEYS.USER_PROFILE,
          STORE_KEYS.ID_TOKEN,
          STORE_KEYS.ACCESS_TOKEN,
          'appliedMigrations',
        ]
        for (const key of migrateKeys) {
          try {
            const fromLegacy = legacy.get(key as any)
            if (fromLegacy !== undefined) {
              // If cache value equals default and legacy has a differing value, prefer legacy
              cache[key] = fromLegacy
              await KeyValueStore.set(key, JSON.stringify(fromLegacy))
            }
          } catch (err) {
            console.warn('[store] Legacy migration read failed for', key, err)
          }
        }
        await KeyValueStore.set('migration:electron_store_v1_done', 'true')
      } catch (err) {
        console.warn(
          '[store] Legacy electron-store not available, skipping migration',
          err,
        )
      }
    }
  } catch (err) {
    console.error('[store] Failed checking migration marker', err)
  }

  // 3) Ensure defaults are present for any missing values
  ensureDefaultsDeep(store, defaultValues)

  // 4) Run migrations (idempotent) unless tests explicitly skip
  if (process.env.NODE_ENV !== 'test') {
    runMigrations(store, migrations)
  }
}

export default store
