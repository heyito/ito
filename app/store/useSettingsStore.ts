import { create } from 'zustand'
import {
  analytics,
  ANALYTICS_EVENTS,
  updateAnalyticsFromSettings,
} from '@/app/components/analytics'
import { STORE_KEYS } from '../../lib/constants/store-keys'
import type {
  KeyboardShortcutConfig,
  KeyboardShortcutMode,
} from '@/lib/main/store'

interface SettingsState {
  shareAnalytics: boolean
  launchAtLogin: boolean
  showItoBarAlways: boolean
  showAppInDock: boolean
  interactionSounds: boolean
  muteAudioWhenDictating: boolean
  microphoneDeviceId: string
  microphoneName: string
  keyboardShortcut: string[]
  keyboardShortcuts: KeyboardShortcutConfig[]
  setShareAnalytics: (share: boolean) => void
  setLaunchAtLogin: (launch: boolean) => void
  setShowItoBarAlways: (show: boolean) => void
  setShowAppInDock: (show: boolean) => void
  setInteractionSounds: (enabled: boolean) => void
  setMuteAudioWhenDictating: (enabled: boolean) => void
  setMicrophoneDeviceId: (deviceId: string, name: string) => void
  setKeyboardShortcut: (shortcut: string[]) => void
  addKeyboardShortcut: (shortcut: string[], mode: KeyboardShortcutMode) => void
  removeKeyboardShortcut: (shortcutId: string) => void
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
    keyboardShortcut: storedSettings?.keyboardShortcut ?? ['fn'], // This fallback is key
    keyboardShortcuts: storedSettings?.keyboardShortcuts ?? [
      { keys: ['fn'], mode: 'transcribe' },
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
    setKeyboardShortcut: (shortcut: string[]) => {
      const currentShortcut = useSettingsStore.getState().keyboardShortcut
      const partialState = { keyboardShortcut: [...shortcut].sort() }
      // Track keyboard shortcut change
      analytics.trackSettings(ANALYTICS_EVENTS.KEYBOARD_SHORTCUT_CHANGED, {
        setting_name: 'keyboardShortcut',
        old_value: currentShortcut,
        new_value: shortcut,
        setting_category: 'input',
      })

      // Update user properties
      analytics.updateUserProperties({
        keyboard_shortcut: shortcut,
      })
      set(partialState)
      syncToStore(partialState)
    },
    addKeyboardShortcut: (shortcut: string[], mode: KeyboardShortcutMode) => {
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
      // If the shortcut is the legacy one, handle it from the old state variable
      if (shortcutId === 'legacy-shortcut') {
        const partialState = { keyboardShortcut: [] }
        set(partialState)
        syncToStore(partialState)

        return
      }

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
