import { create } from 'zustand'

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
  setShareAnalytics: (share: boolean) => void
  setLaunchAtLogin: (launch: boolean) => void
  setShowItoBarAlways: (show: boolean) => void
  setShowAppInDock: (show: boolean) => void
  setInteractionSounds: (enabled: boolean) => void
  setMuteAudioWhenDictating: (enabled: boolean) => void
  setMicrophoneDeviceId: (deviceId: string, name: string) => void
  setKeyboardShortcut: (shortcut: string[]) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedSettings = window.electron.store.get('settings')

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
    firstName: storedSettings?.firstName ?? '',
    lastName: storedSettings?.lastName ?? '',
    email: storedSettings?.email ?? '',
  }
}

// --- START: CORRECTED CODE ---

// Sync to electron store
const syncToStore = (state: Partial<SettingsState>) => {
  const currentSettings = window.electron.store.get('settings') || {}

  // A much simpler and more robust way to merge the settings.
  // This takes all existing settings and overwrites them with only the keys
  // present in the new partial state, without accidentally unsetting others.
  const updatedSettings = {
    ...currentSettings,
    ...state,
  }

  window.electron.store.set('settings', updatedSettings)

  // Notify pill window of settings changes
  if (window.api?.notifySettingsUpdate) {
    window.api.notifySettingsUpdate(updatedSettings)
  }
}

export const useSettingsStore = create<SettingsState>(set => {
  const initialState = getInitialState()

  // Helper for single-property setters
  const createSetter =
    <K extends keyof SettingsState>(key: K) =>
    (value: SettingsState[K]) => {
      const partialState = { [key]: value } as Partial<SettingsState>
      set(partialState)
      syncToStore(partialState)
    }

  return {
    ...initialState,
    setShareAnalytics: createSetter('shareAnalytics'),
    setLaunchAtLogin: (launch: boolean) => {
      const partialState = { launchAtLogin: launch }
      set(partialState)
      syncToStore(partialState)
      if (window.api?.loginItem?.setSettings) {
        window.api.loginItem.setSettings(launch)
      }
    },
    setShowItoBarAlways: createSetter('showItoBarAlways'),
    setShowAppInDock: (show: boolean) => {
      const partialState = { showAppInDock: show }
      set(partialState)
      syncToStore(partialState)
      if (window.api?.dock?.setVisibility) {
        window.api.dock.setVisibility(show)
      }
    },
    setInteractionSounds: createSetter('interactionSounds'),
    setMuteAudioWhenDictating: createSetter('muteAudioWhenDictating'),
    setMicrophoneDeviceId: (deviceId: string, name: string) => {
      const partialState = {
        microphoneDeviceId: deviceId,
        microphoneName: name,
      }
      set(partialState)
      syncToStore(partialState)
    },
    setKeyboardShortcut: (shortcut: string[]) => {
      const partialState = { keyboardShortcut: [...shortcut].sort() }
      set(partialState)
      syncToStore(partialState)
    },
  }
})

if (typeof window !== 'undefined' && window.api?.loginItem?.getSettings) {
  window.api.loginItem
    .getSettings()
    .then(settings => {
      const storedSettings = window.electron.store.get('settings')
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
          const storedSettings = window.electron.store.get('settings')
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
