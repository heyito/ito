import { create } from 'zustand'

interface OnboardingState {
  onboardingStep: number
  onboardingCompleted: boolean
  referralSource: string | null
  shareAnalytics: boolean
  incrementOnboardingStep: () => void
  decrementOnboardingStep: () => void
  setReferralSource: (source: string) => void
  setShareAnalytics: (share: boolean) => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  onboardingStep: 0,
  onboardingCompleted: false,
  referralSource: null,
  shareAnalytics: true,
  incrementOnboardingStep: () =>
    set((state) => ({ onboardingStep: state.onboardingStep + 1 })),
  decrementOnboardingStep: () =>
    set((state) => ({ onboardingStep: state.onboardingStep - 1 })),
  setOnboardingCompleted: () =>
    set((_state) => ({ onboardingCompleted: true })),
  resetOnboarding: () =>
    set((_state) => ({ onboardingStep: 0, onboardingCompleted: false })),
  setReferralSource: (source: string) =>
    set((_state) => ({ referralSource: source })),
  setShareAnalytics: (share: boolean) =>
    set((_state) => ({ shareAnalytics: share })),
}))
