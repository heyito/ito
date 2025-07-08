import { create } from 'zustand'
import { analytics, ANALYTICS_EVENTS } from '../components/analytics'

type OnboardingCategory = 'sign-up' | 'permissions' | 'set-up' | 'try-it'

interface OnboardingState {
  onboardingStep: number
  totalOnboardingSteps: number
  onboardingCompleted: boolean
  onboardingCategory: OnboardingCategory
  referralSource: string | null
  incrementOnboardingStep: () => void
  decrementOnboardingStep: () => void
  setReferralSource: (source: string) => void
  setOnboardingCompleted: () => void
  resetOnboarding: () => void
}

const getOnboardingCategory = (onboardingStep: number): OnboardingCategory => {
  if (onboardingStep < 3) return 'sign-up'
  if (onboardingStep < 4) return 'permissions'
  if (onboardingStep < 7) return 'set-up'
  return 'try-it'
}

export const getOnboardingCategoryIndex = (
  onboardingCategory: OnboardingCategory,
): number => {
  if (onboardingCategory === 'sign-up') return 0
  if (onboardingCategory === 'permissions') return 1
  if (onboardingCategory === 'set-up') return 2
  return 3
}

const getStepName = (step: number): string => {
  const stepNames = [
    'create_account',
    'referral_source',
    'data_control',
    'permissions',
    'microphone_test',
    'keyboard_test',
    'good_to_go',
    'any_app',
    'try_it_out',
  ]
  return stepNames[step] || 'unknown'
}

// Initialize from electron store
const getInitialState = () => {
  const storedOnboarding = window.electron.store.get('onboarding')

  return {
    onboardingStep: storedOnboarding?.onboardingStep ?? 0,
    onboardingCompleted: storedOnboarding?.onboardingCompleted ?? false,
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
}

export const useOnboardingStore = create<OnboardingState>(set => {
  const initialState = getInitialState()

  return {
    onboardingStep: initialState.onboardingStep,
    totalOnboardingSteps: 9,
    onboardingCompleted: initialState.onboardingCompleted,
    onboardingCategory: getOnboardingCategory(initialState.onboardingStep),
    referralSource: null,
    incrementOnboardingStep: () =>
      set(state => {
        const onboardingStep = Math.min(
          state.onboardingStep + 1,
          state.totalOnboardingSteps,
        )
        const onboardingCategory = getOnboardingCategory(onboardingStep)
        const newState = {
          onboardingStep,
          onboardingCategory,
        }
        // Track onboarding step completion
        analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
          step: state.onboardingStep, // The step that was just completed
          step_name: getStepName(state.onboardingStep),
          category: state.onboardingCategory,
          total_steps: state.totalOnboardingSteps,
          referral_source: state.referralSource || undefined,
        })

        // Track viewing of new step
        if (onboardingStep < state.totalOnboardingSteps) {
          analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
            step: onboardingStep,
            step_name: getStepName(onboardingStep),
            category: onboardingCategory,
            total_steps: state.totalOnboardingSteps,
            referral_source: state.referralSource || undefined,
          })
        }

        syncToStore(newState)
        return newState
      }),
    decrementOnboardingStep: () =>
      set(state => {
        const onboardingStep = Math.max(state.onboardingStep - 1, 0)
        const onboardingCategory = getOnboardingCategory(onboardingStep)
        const newState = {
          onboardingStep,
          onboardingCategory,
        }
        // Track viewing of previous step
        analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
          step: onboardingStep,
          step_name: getStepName(onboardingStep),
          category: onboardingCategory,
          total_steps: state.totalOnboardingSteps,
          referral_source: state.referralSource || undefined,
        })

        syncToStore(newState)
        return newState
      }),
    setOnboardingCompleted: () =>
      set(state => {
        analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
          step: state.totalOnboardingSteps,
          step_name: 'completed',
          category: 'try-it',
          total_steps: state.totalOnboardingSteps,
        })

        // Update user properties to mark onboarding as completed
        analytics.updateUserProperties({
          onboarding_completed: true,
          referral_source: state.referralSource || undefined,
        })

        const newState = { onboardingCompleted: true }
        syncToStore(newState)
        return newState
      }),
    resetOnboarding: () =>
      set(_state => {
        const newState = { onboardingStep: 0, onboardingCompleted: false }
        analytics.updateUserProperties({
          onboarding_completed: false,
        })
        syncToStore(newState)
        return newState
      }),
    setReferralSource: (source: string) =>
      set(_state => {
        const newState = { referralSource: source }
        analytics.updateUserProperties({
          referral_source: source,
        })
        syncToStore(newState)
        return newState
      }),
  }
})
