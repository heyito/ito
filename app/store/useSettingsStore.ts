import { create } from 'zustand'
import {
  analytics,
  ANALYTICS_EVENTS,
  updateAnalyticsFromSettings,
} from '@/app/components/analytics'
import { STORE_KEYS } from '../../lib/constants/store-keys'
import type { KeyboardShortcutConfig } from '@/lib/main/store'
import { ItoMode } from '../generated/ito_pb'
import {
  detectConflict,
  getOtherMode,
  normalizeChord,
  pickFallback,
  stringifyChord,
} from '@/app/utils/hotkeysManager'

interface SettingsState {
  shareAnalytics: boolean
  launchAtLogin: boolean
  showItoBarAlways: boolean
  showAppInDock: boolean
  interactionSounds: boolean
  muteAudioWhenDictating: boolean
  microphoneDeviceId: string
  microphoneName: string
  keyboardShortcuts: KeyboardShortcutConfig[]
  hotkeySource: { transcribe: 'onboarding' | 'user'; edit: 'onboarding' | 'user' }
  setShareAnalytics: (share: boolean) => void
  setLaunchAtLogin: (launch: boolean) => void
  setShowItoBarAlways: (show: boolean) => void
  setShowAppInDock: (show: boolean) => void
  setInteractionSounds: (enabled: boolean) => void
  setMuteAudioWhenDictating: (enabled: boolean) => void
  setMicrophoneDeviceId: (deviceId: string, name: string) => void
  addKeyboardShortcut: (shortcut: string[], mode: ItoMode) => void
  removeKeyboardShortcut: (shortcutId: string) => void
  getItoModeShortcuts: (mode: ItoMode) => KeyboardShortcutConfig[]
  updateKeyboardShortcut(
    shortcutId: string,
    keys: string[],
  ): { allowed: boolean; reason?: string }
  setOnboardingHotkey: (keys: string[], mode: ItoMode) => void
}

type SettingCategory = 'general' | 'audio&mic' | 'keyboard' | 'account'

// Initialize from electron store
const getInitialState = () => {
  const storedSettings = window.electron.store.get(STORE_KEYS.SETTINGS)

  return {
    shareAnalytics: storedSettings?.shareAnalytics ?? true,
    launchAtLogin: storedSettings?.launchAtLogin ?? true,
    showItoBarAlways: storedSettings?.showItoBarAlways ?? true,
    showAppInDock: storedSettings?.showAppInDock ?? true,
    interactionSounds: storedSettings?.interactionSounds ?? false,
    muteAudioWhenDictating: storedSettings?.muteAudioWhenDictating ?? false,
    microphoneDeviceId: storedSettings?.microphoneDeviceId ?? 'default',
    microphoneName: storedSettings?.microphoneName ?? 'Default Microphone',
    keyboardShortcuts: storedSettings?.keyboardShortcuts ?? [
      {
        keys: ['control'],
        mode: ItoMode.EDIT,
        id: 'default-edit',
      },
      {
        keys: ['fn'],
        mode: ItoMode.TRANSCRIBE,
        id: 'default-transcribe',
      },
    ],
    hotkeySource:
      storedSettings?.hotkeySource ??
      ({ transcribe: 'onboarding', edit: 'onboarding' } as const),
    firstName: storedSettings?.firstName ?? '',
    lastName: storedSettings?.lastName ?? '',
    email: storedSettings?.email ?? '',
  }
}

// --- START: CORRECTED CODE ---

// Sync to electron store
const syncToStore = (state: Partial<SettingsState>) => {
  const currentSettings = window.electron.store.get(STORE_KEYS.SETTINGS) || {}

  // A much simpler and more robust way to merge the settings.
  // This takes all existing settings and overwrites them with only the keys
  // present in the new partial state, without accidentally unsetting others.
  const updatedSettings = {
    ...currentSettings,
    ...state,
  }

  window.electron.store.set(STORE_KEYS.SETTINGS, updatedSettings)

  // Notify pill window of settings changes
  if (window.api?.notifySettingsUpdate) {
    window.api.notifySettingsUpdate(updatedSettings)
  }
}

export const useSettingsStore = create<SettingsState>(set => {
  const initialState = getInitialState()

  // Helper for single-property setters
  const createSetter =
    <K extends keyof SettingsState>(
      key: K,
      settingCategory: SettingCategory = 'general',
    ) =>
    (value: SettingsState[K]) => {
      const currentValue = useSettingsStore.getState()[key]
      const partialState = { [key]: value } as Partial<SettingsState>
      analytics.trackSettings(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: key as string,
        old_value: currentValue,
        new_value: value,
        setting_category: settingCategory,
      })
      set(partialState)
      syncToStore(partialState)
    }

  return {
    ...initialState,
    setShareAnalytics: (share: boolean) => {
      const partialState = { shareAnalytics: share }
      set(partialState)
      syncToStore(partialState)
      // Update analytics when setting changes
      updateAnalyticsFromSettings(share)
    },
    setLaunchAtLogin: (launch: boolean) => {
      const currentValue = useSettingsStore.getState().launchAtLogin
      const partialState = { launchAtLogin: launch }
      analytics.trackSettings(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: 'launchAtLogin',
        old_value: currentValue,
        new_value: launch,
        setting_category: 'general',
      })
      set(partialState)
      syncToStore(partialState)
      if (window.api?.loginItem?.setSettings) {
        window.api.loginItem.setSettings(launch)
      }
    },
    setShowItoBarAlways: createSetter('showItoBarAlways', 'general'),
    setShowAppInDock: (show: boolean) => {
      const currentValue = useSettingsStore.getState().showAppInDock
      const partialState = { showAppInDock: show }
      // Track setting change
      analytics.trackSettings(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: 'showAppInDock',
        old_value: currentValue,
        new_value: show,
        setting_category: 'ui',
      })

      set(partialState)
      syncToStore(partialState)
      if (window.api?.dock?.setVisibility) {
        window.api.dock.setVisibility(show)
      }
    },
    setInteractionSounds: createSetter('interactionSounds', 'audio&mic'),
    setMuteAudioWhenDictating: createSetter(
      'muteAudioWhenDictating',
      'audio&mic',
    ),
    setMicrophoneDeviceId: (deviceId: string, name: string) => {
      const currentName = useSettingsStore.getState().microphoneName
      analytics.trackSettings(ANALYTICS_EVENTS.MICROPHONE_CHANGED, {
        setting_name: 'microphoneName',
        old_value: currentName,
        new_value: name,
        setting_category: 'audio&mic',
      })
      const partialState = {
        microphoneDeviceId: deviceId,
        microphoneName: name,
      }
      set(partialState)
      syncToStore(partialState)
    },
    addKeyboardShortcut: (shortcut: string[], mode: ItoMode) => {
      const currentShortcuts = useSettingsStore.getState().keyboardShortcuts
      const newShortcuts = [
        ...currentShortcuts,
        { keys: shortcut, mode, id: crypto.randomUUID() },
      ]
      const partialState = {
        keyboardShortcuts: newShortcuts,
      }
      // Track keyboard shortcut change
      analytics.trackSettings(ANALYTICS_EVENTS.KEYBOARD_SHORTCUTS_CHANGED, {
        setting_name: 'keyboardShortcuts',
        old_value: currentShortcuts,
        new_value: newShortcuts,
        setting_category: 'input',
      })

      // Update user properties
      analytics.updateUserProperties({
        keyboard_shortcuts: newShortcuts.map(ks => JSON.stringify(ks)),
      })
      set(partialState)
      syncToStore(partialState)
    },
    removeKeyboardShortcut: (shortcutId: string) => {
      const currentShortcuts = useSettingsStore.getState().keyboardShortcuts
      const newShortcuts = currentShortcuts.filter(ks => ks.id !== shortcutId)
      const partialState = {
        keyboardShortcuts: newShortcuts,
      }
      // Track keyboard shortcut change
      analytics.trackSettings(ANALYTICS_EVENTS.KEYBOARD_SHORTCUTS_CHANGED, {
        setting_name: 'keyboardShortcuts',
        old_value: currentShortcuts,
        new_value: newShortcuts,
        setting_category: 'input',
      })

      // Update user properties
      analytics.updateUserProperties({
        keyboard_shortcuts: newShortcuts.map(ks => JSON.stringify(ks)),
      })
      set(partialState)
      syncToStore(partialState)
    },
    getItoModeShortcuts: (mode: ItoMode) => {
      const { keyboardShortcuts } = useSettingsStore.getState()
      return keyboardShortcuts.filter(ks => ks.mode === mode)
    },
    updateKeyboardShortcut: (shortcutId: string, keys: string[]) => {
      // Normalize keys
      const normalized = normalizeChord(keys)
      const state = useSettingsStore.getState()
      const currentShortcuts = state.keyboardShortcuts
      const currentRow = currentShortcuts.find(ks => ks.id === shortcutId)
      if (!currentRow) {
        return { allowed: false, reason: 'not_found' }
      }
      const mode = currentRow.mode
      const otherMode = getOtherMode(mode)

      // Dedupe within same mode
      const dupInSameMode = currentShortcuts.some(
        ks => ks.mode === mode && ks.id !== shortcutId && stringifyChord(ks.keys) === stringifyChord(normalized),
      )
      if (dupInSameMode) {
        analytics.track('hotkey_settings_add_attempt' as any, {
          mode,
          chord: normalized,
          result: 'blocked',
          reason: 'duplicate_within_mode',
        })
        return { allowed: false, reason: 'duplicate_within_mode' }
      }

      // Cross-mode conflict
      const otherModeChord = state
        .keyboardShortcuts
        .filter(ks => ks.mode === otherMode)
        .map(ks => ks.keys)
      const hasConflict = otherModeChord.some(ch => detectConflict(ch, normalized))
      if (hasConflict) {
        analytics.track('hotkey_conflict_blocked' as any, {
          chord: normalized,
          modes: [mode, otherMode],
        })
        analytics.track('hotkey_settings_add_attempt' as any, {
          mode,
          chord: normalized,
          result: 'blocked',
          reason: 'cross_mode_conflict',
        })
        return { allowed: false, reason: 'cross_mode_conflict' }
      }

      const updatedShortcuts = currentShortcuts.map(ks =>
        ks.id === shortcutId ? { ...ks, keys: normalized } : ks,
      )
      const partialState = {
        keyboardShortcuts: updatedShortcuts,
        hotkeySource: { ...state.hotkeySource, [mode === ItoMode.TRANSCRIBE ? 'transcribe' : 'edit']: 'user' as const },
      }
      // Track keyboard shortcut change
      analytics.trackSettings(ANALYTICS_EVENTS.KEYBOARD_SHORTCUTS_CHANGED, {
        setting_name: 'keyboardShortcuts',
        old_value: currentShortcuts,
        new_value: updatedShortcuts,
        setting_category: 'input',
      })

      analytics.track('hotkey_settings_add_attempt' as any, {
        mode,
        chord: normalized,
        result: 'allowed',
      })

      // Update user properties
      analytics.updateUserProperties({
        keyboard_shortcuts: updatedShortcuts.map(ks => JSON.stringify(ks)),
      })
      set(partialState)
      syncToStore(partialState)
      return { allowed: true }
    },
    setOnboardingHotkey: (keys: string[], mode: ItoMode) => {
      const state = useSettingsStore.getState()
      const normalized = normalizeChord(keys)
      const platform: 'darwin' | 'win32' | 'linux' | 'unknown' =
        navigator?.platform?.toLowerCase().includes('mac')
          ? 'darwin'
          : navigator?.platform?.toLowerCase().includes('win')
            ? 'win32'
            : navigator?.platform?.toLowerCase().includes('linux')
              ? 'linux'
              : 'unknown'

      // Replace any existing onboarding-set hotkey for this mode: we will keep exactly one for the mode
      const filtered = state.keyboardShortcuts.filter(ks => ks.mode !== mode)

      // Ensure other mode does not conflict
      const otherMode = getOtherMode(mode)
      const otherShortcuts = filtered.filter(ks => ks.mode === otherMode)

      let otherUpdated = false
      let nextOtherShortcuts = otherShortcuts
      const conflictWithOther = otherShortcuts.some(ks => detectConflict(ks.keys, normalized))
      if (conflictWithOther) {
        const disallowed = [normalized]
        const fallback = pickFallback(platform, disallowed)
        if (otherShortcuts.length === 0) {
          nextOtherShortcuts = [
            { id: crypto.randomUUID(), mode: otherMode, keys: fallback },
          ]
        } else {
          // Force the first other mode shortcut to fallback and drop any duplicates
          const first = { ...otherShortcuts[0], keys: fallback }
          nextOtherShortcuts = [first]
        }
        otherUpdated = true
      } else {
        // Keep exactly one for other mode as well during onboarding
        if (otherShortcuts.length > 1) {
          nextOtherShortcuts = [otherShortcuts[0]]
          otherUpdated = true
        }
      }

      const newRow: KeyboardShortcutConfig = {
        id: crypto.randomUUID(),
        mode,
        keys: normalized,
      }

      const rebuilt = [
        ...filtered.filter(ks => ks.mode === otherMode ? false : true),
        // Put enforced other mode shortcuts
        ...nextOtherShortcuts,
        // Finally our single hotkey for current mode
        newRow,
      ]

      const source = { ...state.hotkeySource }
      if (mode === ItoMode.TRANSCRIBE) source.transcribe = 'onboarding'
      else source.edit = 'onboarding'
      // If we auto-adjusted the other mode, mark it onboarding too
      if (otherUpdated) {
        if (otherMode === ItoMode.TRANSCRIBE) source.transcribe = 'onboarding'
        else source.edit = 'onboarding'
      }

      const partialState = {
        keyboardShortcuts: rebuilt,
        hotkeySource: source,
      }

      analytics.track('hotkey_onboarding_set' as any, {
        mode,
        chord: normalized,
        platform,
        auto_adjusted: otherUpdated,
      })

      set(partialState)
      syncToStore(partialState)
    },
  }
})

if (typeof window !== 'undefined' && window.api?.loginItem?.getSettings) {
  window.api.loginItem
    .getSettings()
    .then(settings => {
      const storedSettings = window.electron.store.get(STORE_KEYS.SETTINGS)
      if (settings.openAtLogin !== storedSettings?.launchAtLogin) {
        useSettingsStore.getState().setLaunchAtLogin(settings.openAtLogin)
      }
    })
    .catch(error => {
      console.error(
        'Failed to sync login item settings on initialization:',
        error,
      )
    })
}

if (typeof window !== 'undefined' && window.api?.dock?.getVisibility) {
  window.api.invoke('init-window').then((windowInfo: any) => {
    if (windowInfo.platform === 'darwin') {
      window.api.dock
        .getVisibility()
        .then(dockSettings => {
          const storedSettings = window.electron.store.get(STORE_KEYS.SETTINGS)
          if (dockSettings.isVisible !== storedSettings?.showAppInDock) {
            useSettingsStore.getState().setShowAppInDock(dockSettings.isVisible)
          }
        })
        .catch(error => {
          console.error(
            'Failed to sync dock visibility on initialization:',
            error,
          )
        })
    }
  })
}
