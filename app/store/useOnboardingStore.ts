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

export const useOnboardingStore = create<OnboardingState>((set) => ({
  onboardingStep: 7,
  totalOnboardingSteps: 9,
  onboardingCompleted: false,
  onboardingCategory: 'sign-up',
  referralSource: null,
  shareAnalytics: true,
  microphoneDeviceId: 'default',
  keyboardShortcut: ['fn'],
  incrementOnboardingStep: () =>
    set((state) => {
      const onboardingStep = Math.min(
        state.onboardingStep + 1,
        state.totalOnboardingSteps
      )
      const onboardingCategory = getOnboardingCategory(onboardingStep)

      return {
        onboardingStep,
        onboardingCategory,
      }
    }),
  decrementOnboardingStep: () =>
    set((state) => {
      const onboardingStep = Math.max(state.onboardingStep - 1, 0)
      const onboardingCategory = getOnboardingCategory(onboardingStep)

      return {
        onboardingStep,
        onboardingCategory,
      }
    }),
  setOnboardingCompleted: () =>
    set((_state) => ({ onboardingCompleted: true })),
  resetOnboarding: () =>
    set((_state) => ({ onboardingStep: 0, onboardingCompleted: false })),
  setReferralSource: (source: string) =>
    set((_state) => ({ referralSource: source })),
  setShareAnalytics: (share: boolean) =>
    set((_state) => ({ shareAnalytics: share })),
  setMicrophoneDeviceId: (deviceId: string) =>
    set((_state) => ({ microphoneDeviceId: deviceId })),
  setKeyboardShortcut: (shortcut: string[]) =>
    set((_state) => ({ keyboardShortcut: [...shortcut].sort() })),
}))
