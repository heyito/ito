import type { OnboardingCategory } from '../../app/store/useOnboardingStore'

// Event types for type safety
export interface BaseEventProperties {
  timestamp?: string
  session_id?: string
  [key: string]: any
}

export interface OnboardingEventProperties extends BaseEventProperties {
  step: number
  step_name: string
  category: OnboardingCategory
  total_steps: number
  referral_source?: string
  provider?: string
}

export interface HotkeyEventProperties extends BaseEventProperties {
  action: 'press' | 'release'
  keys: string[]
  duration_ms?: number
  session_duration_ms?: number
}

export interface AuthEventProperties extends BaseEventProperties {
  provider: string
  is_returning_user: boolean
  user_id?: string
}

export interface SettingsEventProperties extends BaseEventProperties {
  setting_name: string
  old_value: any
  new_value: any
  setting_category: string
}

export interface UserProperties {
  user_id: string
  email?: string
  name?: string
  provider?: string
  created_at?: string
  last_active?: string
  onboarding_completed?: boolean
  referral_source?: string
  keyboard_shortcuts?: string[]
}

// Event constants
export const ANALYTICS_EVENTS = {
  // Onboarding events
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_STEP_VIEWED: 'onboarding_step_viewed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_ABANDONED: 'onboarding_abandoned',

  // Authentication events
  AUTH_SIGNUP_STARTED: 'auth_signup_started',
  AUTH_SIGNUP_COMPLETED: 'auth_signup_completed',
  AUTH_SIGNIN_STARTED: 'auth_signin_started',
  AUTH_SIGNIN_COMPLETED: 'auth_signin_completed',
  AUTH_SIGNIN_FAILED: 'auth_signin_failed',
  AUTH_LOGOUT: 'auth_logout',
  AUTH_LOGOUT_FAILED: 'auth_logout_failed',
  AUTH_STATE_GENERATION_FAILED: 'auth_state_generation_failed',
  AUTH_METHOD_FAILED: 'auth_method_failed',

  // Recording events
  RECORDING_STARTED: 'recording_started',
  RECORDING_COMPLETED: 'recording_completed',
  MANUAL_RECORDING_STARTED: 'manual_recording_started',
  MANUAL_RECORDING_COMPLETED: 'manual_recording_completed',
  MANUAL_RECORDING_ABANDONED: 'manual_recording_abandoned',

  // Settings events
  SETTING_CHANGED: 'setting_changed',
  MICROPHONE_CHANGED: 'microphone_changed',
  KEYBOARD_SHORTCUTS_CHANGED: 'keyboard_shortcuts_changed',
} as const

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
