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
  setMicrophoneDeviceId: (deviceId: string, name?: string) => void
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
    interactionSounds: storedSettings?.interactionSounds ?? true,
    muteAudioWhenDictating: storedSettings?.muteAudioWhenDictating ?? false,
    microphoneDeviceId: storedSettings?.microphoneDeviceId ?? 'default',
    microphoneName: storedSettings?.microphoneName ?? 'Default Microphone',
    keyboardShortcut: storedSettings?.keyboardShortcut ?? ['fn'],
    firstName: storedSettings?.firstName ?? '',
    lastName: storedSettings?.lastName ?? '',
    email: storedSettings?.email ?? '',
  }
}

// Sync to electron store
const syncToStore = (state: Partial<SettingsState>) => {
  const currentSettings = window.electron.store.get('settings') || {}
  window.electron.store.set('settings', {
    ...currentSettings,
    shareAnalytics: state.shareAnalytics ?? currentSettings.shareAnalytics,
    launchAtLogin: state.launchAtLogin ?? currentSettings.launchAtLogin,
    showItoBarAlways:
      state.showItoBarAlways ?? currentSettings.showItoBarAlways,
    showAppInDock: state.showAppInDock ?? currentSettings.showAppInDock,
    interactionSounds:
      state.interactionSounds ?? currentSettings.interactionSounds,
    muteAudioWhenDictating:
      state.muteAudioWhenDictating ?? currentSettings.muteAudioWhenDictating,
    microphoneDeviceId:
      state.microphoneDeviceId ?? currentSettings.microphoneDeviceId,
    microphoneName: state.microphoneName ?? currentSettings.microphoneName,
    keyboardShortcut:
      state.keyboardShortcut ?? currentSettings.keyboardShortcut,
  })
}

export const useSettingsStore = create<SettingsState>(set => {
  const initialState = getInitialState()

  // Helper function to reduce duplication in setters
  const createSetter =
    <K extends keyof SettingsState>(key: K) =>
    (value: SettingsState[K]) =>
      set(_state => {
        const newState = { [key]: value } as Partial<SettingsState>
        syncToStore(newState)
        return newState
      })

  return {
    shareAnalytics: initialState.shareAnalytics,
    launchAtLogin: initialState.launchAtLogin,
    showItoBarAlways: initialState.showItoBarAlways,
    showAppInDock: initialState.showAppInDock,
    interactionSounds: initialState.interactionSounds,
    muteAudioWhenDictating: initialState.muteAudioWhenDictating,
    microphoneDeviceId: initialState.microphoneDeviceId,
    microphoneName: initialState.microphoneName,
    keyboardShortcut: initialState.keyboardShortcut,
    setShareAnalytics: createSetter('shareAnalytics'),
    setLaunchAtLogin: (launch: boolean) =>
      set(_state => {
        const newState = { launchAtLogin: launch } as Partial<SettingsState>
        syncToStore(newState)
        // Also set the actual Electron login item settings
        if (window.api?.loginItem?.setSettings) {
          window.api.loginItem.setSettings(launch)
        }
        return newState
      }),
    setShowItoBarAlways: createSetter('showItoBarAlways'),
    setShowAppInDock: createSetter('showAppInDock'),
    setInteractionSounds: createSetter('interactionSounds'),
    setMuteAudioWhenDictating: createSetter('muteAudioWhenDictating'),
    // Special case: can set both deviceId and optionally name
    setMicrophoneDeviceId: (deviceId: string, name?: string) =>
      set(_state => {
        const newState = {
          microphoneDeviceId: deviceId,
          ...(name && { microphoneName: name }),
        }
        syncToStore(newState)
        return newState
      }),
    // Special case: sorts the array
    setKeyboardShortcut: (shortcut: string[]) =>
      set(_state => {
        const newState = { keyboardShortcut: [...shortcut].sort() }
        syncToStore(newState)
        return newState
      }),
  }
})

// Sync with actual Electron login item settings on initialization
if (typeof window !== 'undefined' && window.api?.loginItem?.getSettings) {
  window.api.loginItem
    .getSettings()
    .then(settings => {
      const storedSettings = window.electron.store.get('settings')
      if (settings.openAtLogin !== storedSettings?.launchAtLogin) {
        // Update the store to match actual Electron settings
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
