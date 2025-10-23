import { create } from 'zustand'
import log from 'electron-log'

interface AudioState {
  isRecording: boolean
  isShortcutEnabled: boolean
  setIsShortcutEnabled: (enabled: boolean) => void
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isRecording: false,
  isShortcutEnabled: true,

  setIsShortcutEnabled: (enabled: boolean) => {
    set({ isShortcutEnabled: enabled })
  },

  startRecording: async () => {
    const { isRecording, isShortcutEnabled } = get()
    if (isRecording || !isShortcutEnabled) return

    console.log('[AudioStore] Starting native recording...')
    set({ isRecording: true })
    // Signal the main process to start the gRPC stream and tell the
    // native recorder to begin capturing.
    window.api.send('start-native-recording')
  },

  stopRecording: async () => {
    const { isRecording } = get()
    if (!isRecording) return

    console.log('[AudioStore] Stopping native recording...')
    // Signal the main process to tell the native recorder to stop
    // and to close the gRPC stream.
    window.api.send('stop-native-recording')
    set({ isRecording: false })
  },
}))
