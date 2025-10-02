import posthog from 'posthog-js'
import log from 'electron-log'
import { STORE_KEYS } from '../../../lib/constants/store-keys'
import { v4 as uuidv4 } from 'uuid'
import type { OnboardingCategory } from '../../store/useOnboardingStore'

// Get or generate a machine-based device ID that's shared across all windows
const getSharedDeviceId = async (): Promise<string> => {
  try {
    // Just request the device ID - main process handles generation/caching
    const deviceId = await window.api?.invoke('analytics:get-device-id')
    if (deviceId) {
      log.info('[Analytics] Using machine-based device ID:', deviceId)
      return deviceId
    }
    throw new Error('No device ID returned from main process')
  } catch (error) {
    log.error('[Analytics] Could not get machine device ID:', error)
    // In true emergency, generate a temporary UUID as fallback
    return uuidv4()
  }
}

// Check if analytics should be enabled
const getAnalyticsEnabled = (): boolean => {
  if (!import.meta.env.VITE_POSTHOG_API_KEY) {
    console.warn('[Analytics] No PostHog API key found, analytics disabled')
    return false
  }
  try {
    const settings = window.electron?.store?.get(STORE_KEYS.SETTINGS)
    return settings?.shareAnalytics ?? true
  } catch (error) {
    console.warn(
      '[Analytics] Could not read settings, defaulting to enabled:',
      error,
    )
    return true
  }
}

const initPostHog = () => {
  posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_decide: true,
    persistence: 'cookie',
    sanitize_properties: (props: Record<string, unknown>) => {
      const p = { ...props }
      delete (p as any).$current_url
      delete (p as any).$pathname
      delete (p as any).$host
      delete (p as any).$referrer
      return p
    },
  })
}

// Initialize PostHog only if analytics is enabled
let isAnalyticsInitialized = false
let sharedDeviceId: string | null = null
const analyticsEnabled = getAnalyticsEnabled()

console.log('[Analytics] Analytics enabled:', analyticsEnabled)

// Initialize PostHog asynchronously
const initializeAnalytics = async () => {
  if (!analyticsEnabled) {
    log.info('[Analytics] PostHog disabled by user settings')
    return
  }

  try {
    sharedDeviceId = await getSharedDeviceId()
    console.log('[Analytics] Using shared device ID:', sharedDeviceId)

    initPostHog()

    if (sharedDeviceId) {
      posthog.register({ device_id: sharedDeviceId })
    }
    isAnalyticsInitialized = true

    // Update the service instance after successful initialization
    analytics.updateInitializationStatus(true, sharedDeviceId)

    log.info(
      '[Analytics] PostHog initialized with shared device ID:',
      sharedDeviceId,
    )
  } catch (error) {
    log.error('[Analytics] Failed to initialize analytics:', error)
  }
}

// Initialize analytics when the module loads
initializeAnalytics()

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

/**
 * Professional Analytics Service for Ito
 * Handles all analytics tracking with proper typing and error handling
 */
class AnalyticsService {
  private isInitialized: boolean = isAnalyticsInitialized
  private currentUserId: string | null = null
  private currentProvider: string | null = null
  private sessionStartTime: number = Date.now()
  private deviceId: string | null = null

  constructor() {
    // Device ID will be set after async initialization
    this.deviceId = sharedDeviceId
    log.info(
      `[Analytics] Service initialized (enabled: ${this.isInitialized}, deviceId: ${this.deviceId || 'pending'})`,
    )
  }

  /**
   * Enable analytics (re-initialize if needed)
   */
  async enableAnalytics() {
    if (!this.isInitialized && import.meta.env.VITE_POSTHOG_API_KEY) {
      try {
        const deviceId = await getSharedDeviceId()
        this.deviceId = deviceId
        initPostHog()
        if (deviceId) {
          posthog.register({ device_id: deviceId })
        }
        this.isInitialized = true
        log.info(
          '[Analytics] Analytics enabled and initialized with shared device ID:',
          deviceId,
        )
      } catch (error) {
        log.error('[Analytics] Failed to enable analytics:', error)
      }
    }
  }

  /**
   * Disable analytics
   */
  disableAnalytics() {
    this.isInitialized = false
    this.currentUserId = null
    this.currentProvider = null
    try {
      posthog.opt_out_capturing()
    } catch (error) {
      log.warn('[Analytics] Failed to opt-out capturing:', error)
    }
    log.info('[Analytics] Analytics disabled')
  }

  /**
   * Check if analytics is currently enabled
   */
  isEnabled(): boolean {
    return this.isInitialized
  }

  /**
   * Set user identification and properties
   */
  identifyUser(
    userId: string,
    properties: Partial<UserProperties> = {},
    provider?: string,
  ) {
    console.log('identifyUser', userId, properties, provider)

    // Store provider information
    if (provider) {
      this.currentProvider = provider
    }

    if (!this.shouldTrack()) {
      log.info(
        '[Analytics] User identification skipped - analytics disabled or self-hosted user',
      )
      return
    }

    try {
      if (this.currentUserId !== userId) {
        this.currentUserId = userId
        const props = {
          user_id: userId,
          last_active: new Date().toISOString(),
          ...properties,
        }
        posthog.identify(userId, props)
        log.info(
          `[Analytics] User identified: ${userId} (deviceId: ${this.deviceId || 'pending'})`,
        )
      } else if (Object.keys(properties).length > 0) {
        posthog.identify(undefined, {
          ...properties,
          last_active: new Date().toISOString(),
        })
      }
    } catch (error) {
      log.error('[Analytics] Failed to identify user:', error)
    }
  }

  /**
   * Update user properties
   */
  updateUserProperties(properties: Partial<UserProperties>) {
    if (!this.shouldTrack() || !this.currentUserId) {
      log.info(
        '[Analytics] User properties update skipped - analytics disabled, self-hosted user, or user not identified',
      )
      return
    }

    try {
      posthog.identify(undefined, properties)
      log.info('[Analytics] User properties updated')
    } catch (error) {
      log.error('[Analytics] Failed to update user properties:', error)
    }
  }

  /**
   * Track a generic event
   */
  track(eventName: AnalyticsEvent, properties: BaseEventProperties = {}) {
    if (!this.shouldTrack()) {
      return
    }

    try {
      const eventProperties = {
        timestamp: new Date().toISOString(),
        session_duration_ms: Date.now() - this.sessionStartTime,
        ...properties,
      }

      posthog.capture(eventName, {
        ...eventProperties,
        ...(this.currentUserId ? { user_id: this.currentUserId } : {}),
      })
      log.info(
        `[Analytics] Event tracked: ${eventName} (deviceId: ${this.deviceId || 'pending'}, userId: ${this.currentUserId || 'anonymous'})`,
      )
    } catch (error) {
      log.error(`[Analytics] Failed to track event ${eventName}:`, error)
    }
  }

  /**
   * Track onboarding events
   */
  trackOnboarding(
    eventName: Extract<
      AnalyticsEvent,
      | 'onboarding_started'
      | 'onboarding_step_completed'
      | 'onboarding_step_viewed'
      | 'onboarding_completed'
      | 'onboarding_abandoned'
    >,
    properties: OnboardingEventProperties,
  ) {
    console.log('trackOnboarding', eventName, properties)
    this.track(eventName, properties)
  }

  /**
   * Track authentication events
   */
  trackAuth(
    eventName: Extract<
      AnalyticsEvent,
      | 'auth_signup_started'
      | 'auth_signup_completed'
      | 'auth_signin_started'
      | 'auth_signin_completed'
      | 'auth_logout'
    >,
    properties: AuthEventProperties,
  ) {
    this.track(eventName, properties)
  }

  /**
   * Track settings changes
   */
  trackSettings(
    eventName: Extract<
      AnalyticsEvent,
      | 'setting_changed'
      | 'microphone_changed'
      | 'keyboard_shortcut_changed'
      | 'privacy_mode_toggled'
      | 'keyboard_shortcuts_changed'
    >,
    properties: SettingsEventProperties,
  ) {
    this.track(eventName, properties)
  }

  /**
   * Track permission events
   */
  trackPermission(
    eventName: Extract<
      AnalyticsEvent,
      'permission_requested' | 'permission_granted' | 'permission_denied'
    >,
    permissionType: 'microphone' | 'accessibility',
    properties: BaseEventProperties = {},
  ) {
    this.track(eventName, {
      permission_type: permissionType,
      ...properties,
    })
  }

  /**
   * Reset analytics (for logout)
   */
  resetUser() {
    if (!this.isInitialized) {
      log.info('[Analytics] User reset skipped - analytics disabled')
      return
    }

    try {
      posthog.reset()
      this.currentUserId = null
      this.currentProvider = null
      log.info('[Analytics] User session reset')
    } catch (error) {
      log.error('[Analytics] Failed to reset user session:', error)
    }
  }

  /**
   * Get current session duration
   */
  getSessionDuration(): number {
    return Date.now() - this.sessionStartTime
  }

  /**
   * Check if user is identified
   */
  isUserIdentified(): boolean {
    return this.currentUserId !== null
  }

  /**
   * Get the current device ID
   */
  getDeviceId(): string | null {
    return this.deviceId
  }

  /**
   * Update initialization status (called after async initialization completes)
   */
  updateInitializationStatus(isInitialized: boolean, deviceId: string | null) {
    this.isInitialized = isInitialized
    this.deviceId = deviceId
    log.info(
      `[Analytics] Service status updated (enabled: ${this.isInitialized}, deviceId: ${this.deviceId})`,
    )
  }

  /**
   * Check if analytics should be tracked based on provider
   */
  private shouldTrack(): boolean {
    if (!this.isInitialized) {
      return false
    }

    // Skip tracking for self-hosted users
    if (this.currentProvider === 'self-hosted') {
      log.info('[Analytics] Tracking skipped - self-hosted user')
      return false
    }

    return true
  }
}

// Export singleton instance
export const analytics = new AnalyticsService()

// Function to update analytics based on settings change
export const updateAnalyticsFromSettings = (shareAnalytics: boolean) => {
  if (shareAnalytics && !analytics.isEnabled()) {
    analytics.enableAnalytics()
    log.info('[Analytics] Analytics enabled by settings change')
  } else if (!shareAnalytics && analytics.isEnabled()) {
    analytics.disableAnalytics()
    log.info('[Analytics] Analytics disabled by settings change')
  }
}

// Export convenience functions
export const trackEvent = analytics.track.bind(analytics)
export const identifyUser = analytics.identifyUser.bind(analytics)
export const updateUserProperties =
  analytics.updateUserProperties.bind(analytics)
export const resetAnalytics = analytics.resetUser.bind(analytics)
