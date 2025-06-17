import { create } from 'zustand'

interface PermissionsState {
  isAccessibilityEnabled: boolean
  isMicrophoneEnabled: boolean
  setAccessibilityEnabled: (enabled: boolean) => void
  setMicrophoneEnabled: (enabled: boolean) => void
}

export const usePermissionsStore = create<PermissionsState>(set => ({
  isAccessibilityEnabled: false,
  isMicrophoneEnabled: false,
  setAccessibilityEnabled: enabled => set({ isAccessibilityEnabled: enabled }),
  setMicrophoneEnabled: enabled => set({ isMicrophoneEnabled: enabled }),
}))
