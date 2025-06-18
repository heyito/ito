import { create } from 'zustand'

interface SettingsState {
  shareAnalytics: boolean
  microphoneDeviceId: string
  keyboardShortcut: string[]
  setShareAnalytics: (share: boolean) => void
  setMicrophoneDeviceId: (deviceId: string) => void
  setKeyboardShortcut: (shortcut: string[]) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedSettings = window.electron.store.get('settings')

  return {
    shareAnalytics: storedSettings?.shareAnalytics ?? true,
    microphoneDeviceId: storedSettings?.microphoneDeviceId ?? 'default',
    keyboardShortcut: storedSettings?.keyboardShortcut ?? ['fn'],
  }
}

// Sync to electron store
const syncToStore = (state: Partial<SettingsState>) => {
  const currentSettings = window.electron.store.get('settings') || {}
  window.electron.store.set('settings', {
    ...currentSettings,
    shareAnalytics: state.shareAnalytics ?? currentSettings.shareAnalytics,
    microphoneDeviceId:
      state.microphoneDeviceId ?? currentSettings.microphoneDeviceId,
    keyboardShortcut:
      state.keyboardShortcut ?? currentSettings.keyboardShortcut,
  })
}

export const useSettingsStore = create<SettingsState>(set => {
  const initialState = getInitialState()

  return {
    shareAnalytics: initialState.shareAnalytics,
    microphoneDeviceId: initialState.microphoneDeviceId,
    keyboardShortcut: initialState.keyboardShortcut,
    setShareAnalytics: (share: boolean) =>
      set(_state => {
        const newState = { shareAnalytics: share }
        syncToStore(newState)
        return newState
      }),
    setMicrophoneDeviceId: (deviceId: string) =>
      set(_state => {
        const newState = { microphoneDeviceId: deviceId }
        syncToStore(newState)
        return newState
      }),
    setKeyboardShortcut: (shortcut: string[]) =>
      set(_state => {
        const newState = { keyboardShortcut: [...shortcut].sort() }
        syncToStore(newState)
        return newState
      }),
  }
})
