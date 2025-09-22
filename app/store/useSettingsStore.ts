import { create } from 'zustand'
import {
  analytics,
  ANALYTICS_EVENTS,
  updateAnalyticsFromSettings,
} from '@/app/components/analytics'
import { STORE_KEYS } from '../../lib/constants/store-keys'
import type { KeyboardShortcutConfig } from '@/lib/main/store'
import { ItoMode } from '../generated/ito_pb'

import { ITO_MODE_SHORTCUT_DEFAULTS } from '@/lib/constants/keyboard-defaults'
import {
  normalizeChord,
  ShortcutResult,
  validateShortcutForDuplicate,
  isReservedCombination,
} from '../utils/keyboard'
import { KeyName } from '@/lib/types/keyboard'

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
  setShareAnalytics: (share: boolean) => void
  setLaunchAtLogin: (launch: boolean) => void
  setShowItoBarAlways: (show: boolean) => void
  setShowAppInDock: (show: boolean) => void
  setInteractionSounds: (enabled: boolean) => void
  setMuteAudioWhenDictating: (enabled: boolean) => void
  setMicrophoneDeviceId: (deviceId: string, name: string) => void
  createKeyboardShortcut: (mode: ItoMode) => ShortcutResult
  removeKeyboardShortcut: (shortcutId: string) => void
  getItoModeShortcuts: (mode: ItoMode) => KeyboardShortcutConfig[]
  updateKeyboardShortcut: (
    shortcutId: string,
    keys: KeyName[],
  ) => Promise<ShortcutResult>
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
        keys: ITO_MODE_SHORTCUT_DEFAULTS[ItoMode.EDIT],
        mode: ItoMode.EDIT,
        id: crypto.randomUUID(),
      },
      {
        keys: ITO_MODE_SHORTCUT_DEFAULTS[ItoMode.TRANSCRIBE],
        mode: ItoMode.TRANSCRIBE,
        id: crypto.randomUUID(),
      },
    ],
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
    createKeyboardShortcut: (mode: ItoMode): ShortcutResult => {
      const currentShortcuts = useSettingsStore.getState().keyboardShortcuts

      const newShortcut = {
        keys: [],
        mode,
        id: crypto.randomUUID(),
      }

      const newShortcuts = [...currentShortcuts, newShortcut]
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
      return { success: true }
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
    updateKeyboardShortcut: async (
      shortcutId: string,
      keys: KeyName[],
    ): Promise<ShortcutResult> => {
      const currentShortcuts = useSettingsStore.getState()
        .keyboardShortcuts as KeyboardShortcutConfig[]

      const shortcut = currentShortcuts.find(ks => ks.id === shortcutId)

      if (!shortcut) {
        return { success: false, error: 'not-found' }
      }

      const normalizedKeys = normalizeChord(keys)

      // Get platform for validation
      const platform = await window.api.getPlatform()

      // Check for reserved combinations
      const reservedCheck = isReservedCombination(normalizedKeys, platform)
      if (reservedCheck.isReserved) {
        return {
          success: false,
          error: 'reserved-combination',
          errorMessage: reservedCheck.reason,
        }
      }

      const newShortcut = {
        ...shortcut,
        keys: normalizedKeys,
      }

      const duplicateError = validateShortcutForDuplicate(
        currentShortcuts,
        newShortcut,
        shortcut.mode,
      )
      if (duplicateError) {
        return duplicateError
      }

      const updatedShortcuts = currentShortcuts.map(ks =>
        ks.id === shortcutId ? { ...ks, keys: normalizedKeys } : ks,
      )
      const partialState = {
        keyboardShortcuts: updatedShortcuts,
      }
      // Track keyboard shortcut change
      analytics.trackSettings(ANALYTICS_EVENTS.KEYBOARD_SHORTCUTS_CHANGED, {
        setting_name: 'keyboardShortcuts',
        old_value: currentShortcuts,
        new_value: updatedShortcuts,
        setting_category: 'input',
      })

      // Update user properties
      analytics.updateUserProperties({
        keyboard_shortcuts: updatedShortcuts.map(ks => JSON.stringify(ks)),
      })
      set(partialState)
      syncToStore(partialState)

      return { success: true }
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
