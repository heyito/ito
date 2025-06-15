import { create } from 'zustand'

type OnboardingCategory = 'sign-up' | 'permissions' | 'set-up' | 'try-it'

interface OnboardingState {
  onboardingStep: number
  totalOnboardingSteps: number
  onboardingCompleted: boolean
  onboardingCategory: OnboardingCategory
  referralSource: string | null
  shareAnalytics: boolean
  microphoneDeviceId: string
  keyboardShortcut: string[]
  incrementOnboardingStep: () => void
  decrementOnboardingStep: () => void
  setReferralSource: (source: string) => void
  setShareAnalytics: (share: boolean) => void
  setMicrophoneDeviceId: (deviceId: string) => void
  setKeyboardShortcut: (shortcut: string[]) => void
  setOnboardingCompleted: () => void
  resetOnboarding: () => void
}

const getOnboardingCategory = (onboardingStep: number): OnboardingCategory => {
  if (onboardingStep < 2) return 'sign-up'
  if (onboardingStep < 3) return 'permissions'
  if (onboardingStep < 6) return 'set-up'
  return 'try-it'
}

export const getOnboardingCategoryIndex = (
  onboardingCategory: OnboardingCategory
): number => {
  if (onboardingCategory === 'sign-up') return 0
  if (onboardingCategory === 'permissions') return 1
  if (onboardingCategory === 'set-up') return 2
  return 3
}

// Initialize from electron store
const getInitialState = () => {
  const storedOnboarding = window.electron.store.get('onboarding')
  const storedSettings = window.electron.store.get('settings')

  return {
    onboardingStep: storedOnboarding?.onboardingStep ?? 0,
    onboardingCompleted: storedOnboarding?.onboardingCompleted ?? false,
    shareAnalytics: storedSettings?.shareAnalytics ?? true,
    microphoneDeviceId: storedSettings?.microphoneDeviceId ?? 'default',
    keyboardShortcut: storedSettings?.keyboardShortcut ?? ['fn'],
  }
}

// Sync to electron store
const syncToStore = (state: Partial<OnboardingState>) => {
  if ('onboardingStep' in state || 'onboardingCompleted' in state) {
    const currentStore = window.electron.store.get('onboarding') || {}
    window.electron.store.set('onboarding', {
      ...currentStore,
      onboardingStep: state.onboardingStep ?? currentStore.onboardingStep,
      onboardingCompleted:
        state.onboardingCompleted ?? currentStore.onboardingCompleted,
    })
  }

  if (
    'shareAnalytics' in state ||
    'microphoneDeviceId' in state ||
    'keyboardShortcut' in state
  ) {
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
}

export const useOnboardingStore = create<OnboardingState>((set) => {
  const initialState = getInitialState()

  return {
    onboardingStep: initialState.onboardingStep,
    totalOnboardingSteps: 8,
    onboardingCompleted: initialState.onboardingCompleted,
    onboardingCategory: getOnboardingCategory(initialState.onboardingStep),
    referralSource: null,
    shareAnalytics: initialState.shareAnalytics,
    microphoneDeviceId: initialState.microphoneDeviceId,
    keyboardShortcut: initialState.keyboardShortcut,
    incrementOnboardingStep: () =>
      set((state) => {
        const onboardingStep = Math.min(
          state.onboardingStep + 1,
          state.totalOnboardingSteps
        )
        const onboardingCategory = getOnboardingCategory(onboardingStep)
        const newState = {
          onboardingStep,
          onboardingCategory,
        }
        syncToStore(newState)
        return newState
      }),
    decrementOnboardingStep: () =>
      set((state) => {
        const onboardingStep = Math.max(state.onboardingStep - 1, 0)
        const onboardingCategory = getOnboardingCategory(onboardingStep)
        const newState = {
          onboardingStep,
          onboardingCategory,
        }
        syncToStore(newState)
        return newState
      }),
    setOnboardingCompleted: () =>
      set((_state) => {
        const newState = { onboardingCompleted: true }
        syncToStore(newState)
        return newState
      }),
    resetOnboarding: () =>
      set((_state) => {
        const newState = { onboardingStep: 0, onboardingCompleted: false }
        syncToStore(newState)
        return newState
      }),
    setReferralSource: (source: string) =>
      set((_state) => ({ referralSource: source })),
    setShareAnalytics: (share: boolean) =>
      set((_state) => {
        const newState = { shareAnalytics: share }
        syncToStore(newState)
        return newState
      }),
    setMicrophoneDeviceId: (deviceId: string) =>
      set((_state) => {
        const newState = { microphoneDeviceId: deviceId }
        syncToStore(newState)
        return newState
      }),
    setKeyboardShortcut: (shortcut: string[]) =>
      set((_state) => {
        const newState = { keyboardShortcut: [...shortcut].sort() }
        syncToStore(newState)
        return newState
      }),
  }
})
