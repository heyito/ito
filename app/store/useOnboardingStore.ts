import { create } from 'zustand'
import { analytics, ANALYTICS_EVENTS } from '../components/analytics'
import { STORE_KEYS } from '../../lib/constants/store-keys'

// Onboarding category constants
export const ONBOARDING_CATEGORIES = {
  SIGN_UP: 'sign-up',
  PERMISSIONS: 'permissions',
  SET_UP: 'set-up',
  TRY_IT: 'try-it',
} as const

// Export the type so it can be used in other files
export type OnboardingCategory =
  (typeof ONBOARDING_CATEGORIES)[keyof typeof ONBOARDING_CATEGORIES]

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
  initializeOnboarding: () => void
}

// Step name constants
export const STEP_NAMES = {
  CREATE_ACCOUNT: 'create_account',
  REFERRAL_SOURCE: 'referral_source',
  DATA_CONTROL: 'data_control',
  PERMISSIONS: 'permissions',
  MICROPHONE_TEST: 'microphone_test',
  KEYBOARD_TEST: 'keyboard_test',
  GOOD_TO_GO: 'good_to_go',
  INTRODUCING_INTELLIGENT_MODE: 'introducing_intelligent_mode',
  ANY_APP: 'any_app',
  TRY_IT_OUT: 'try_it_out',
}

// Order here matters for onboarding flow
export const STEP_NAMES_ARRAY = [
  STEP_NAMES.CREATE_ACCOUNT,
  STEP_NAMES.REFERRAL_SOURCE,
  STEP_NAMES.DATA_CONTROL,
  STEP_NAMES.PERMISSIONS,
  STEP_NAMES.MICROPHONE_TEST,
  STEP_NAMES.KEYBOARD_TEST,
  STEP_NAMES.GOOD_TO_GO,
  STEP_NAMES.INTRODUCING_INTELLIGENT_MODE,
  STEP_NAMES.ANY_APP,
  STEP_NAMES.TRY_IT_OUT,
]

const getOnboardingCategory = (onboardingStep: number): OnboardingCategory => {
  if (onboardingStep < 3) return ONBOARDING_CATEGORIES.SIGN_UP
  if (onboardingStep < 4) return ONBOARDING_CATEGORIES.PERMISSIONS
  if (onboardingStep < 7) return ONBOARDING_CATEGORIES.SET_UP
  return ONBOARDING_CATEGORIES.TRY_IT
}

export const getOnboardingCategoryIndex = (
  onboardingCategory: OnboardingCategory,
): number => {
  if (onboardingCategory === ONBOARDING_CATEGORIES.SIGN_UP) return 0
  if (onboardingCategory === ONBOARDING_CATEGORIES.PERMISSIONS) return 1
  if (onboardingCategory === ONBOARDING_CATEGORIES.SET_UP) return 2
  return 3
}

const getStepName = (step: number): string => {
  return STEP_NAMES_ARRAY[step] || 'unknown'
}

// Initialize from electron store
const getInitialState = () => {
  const storedOnboarding = window.electron.store.get(STORE_KEYS.ONBOARDING)

  return {
    onboardingStep: storedOnboarding?.onboardingStep ?? 0,
    onboardingCompleted: storedOnboarding?.onboardingCompleted ?? false,
  }
}

// Sync to electron store
const syncToStore = (state: Partial<OnboardingState>) => {
  if ('onboardingStep' in state || 'onboardingCompleted' in state) {
    const currentStore = window.electron.store.get(STORE_KEYS.ONBOARDING) || {}
    window.electron.store.set(STORE_KEYS.ONBOARDING, {
      ...currentStore,
      onboardingStep: state.onboardingStep ?? currentStore.onboardingStep,
      onboardingCompleted:
        state.onboardingCompleted ?? currentStore.onboardingCompleted,
    })

    window.api.notifyOnboardingUpdate(state)
  }
}

export const useOnboardingStore = create<OnboardingState>(set => {
  const initialState = getInitialState()
  const totalOnboardingSteps = STEP_NAMES_ARRAY.length

  return {
    onboardingStep: initialState.onboardingStep,
    totalOnboardingSteps,
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
        const step = state.totalOnboardingSteps - 1
        analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
          step: state.totalOnboardingSteps,
          step_name: getStepName(step),
          category: getOnboardingCategory(step),
          total_steps: state.totalOnboardingSteps,
        })

        analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
          step: state.totalOnboardingSteps,
          step_name: 'completed',
          category: ONBOARDING_CATEGORIES.TRY_IT,
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
    initializeOnboarding: () => {
      const step = 0
      const onboardingCategory = getOnboardingCategory(step)
      analytics.trackOnboarding(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
        step,
        step_name: getStepName(0),
        category: onboardingCategory,
        total_steps: totalOnboardingSteps,
      })
    },
  }
})
