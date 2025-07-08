import {
  init,
  track,
  identify,
  setUserId,
  Identify,
} from '@amplitude/analytics-browser'
import log from 'electron-log'

// Check if analytics should be enabled
const getAnalyticsEnabled = (): boolean => {
  // First check if API key is available
  if (!import.meta.env.VITE_AMPLITUDE_API_KEY) {
    console.warn('[Analytics] No API key found, analytics disabled')
    return false
  }

  // Then check user settings
  try {
    const settings = window.electron?.store?.get('settings')
    return settings?.shareAnalytics ?? true
  } catch (error) {
    console.warn(
      '[Analytics] Could not read settings, defaulting to enabled:',
      error,
    )
    return true
  }
}

// Initialize Amplitude only if analytics is enabled
let isAnalyticsInitialized = false
const analyticsEnabled = getAnalyticsEnabled()

console.log('VITE_AMPLITUDE_API_KEY', import.meta.env.VITE_AMPLITUDE_API_KEY)
console.log('[Analytics] Analytics enabled:', analyticsEnabled)

if (analyticsEnabled) {
  init(import.meta.env.VITE_AMPLITUDE_API_KEY, {
    autocapture: {
      elementInteractions: false,
      pageViews: false,
      sessions: true, // Keep session tracking enabled
      formInteractions: false,
      fileDownloads: false,
    },
  })
  isAnalyticsInitialized = true
  log.info('[Analytics] Amplitude initialized')
} else {
  log.info('[Analytics] Amplitude disabled by user settings')
}

// Event types for type safety
export interface BaseEventProperties {
  timestamp?: string
  session_id?: string
  [key: string]: any
}

export interface OnboardingEventProperties extends BaseEventProperties {
  step: number
  step_name: string
  category: 'sign-up' | 'permissions' | 'set-up' | 'try-it'
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
  keyboard_shortcut?: string[]
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

  // Hotkey events
  HOTKEY_PRESSED: 'hotkey_pressed',
  HOTKEY_RELEASED: 'hotkey_released',
  HOTKEY_SESSION_STARTED: 'hotkey_session_started',
  HOTKEY_SESSION_ENDED: 'hotkey_session_ended',

  // Settings events
  SETTING_CHANGED: 'setting_changed',
  MICROPHONE_CHANGED: 'microphone_changed',
  KEYBOARD_SHORTCUT_CHANGED: 'keyboard_shortcut_changed',
  PRIVACY_MODE_TOGGLED: 'privacy_mode_toggled',

  // Permission events
  PERMISSION_REQUESTED: 'permission_requested',
  PERMISSION_GRANTED: 'permission_granted',
  PERMISSION_DENIED: 'permission_denied',

  // Usage events
  TRANSCRIPTION_STARTED: 'transcription_started',
  TRANSCRIPTION_COMPLETED: 'transcription_completed',
  TEXT_INSERTED: 'text_inserted',
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
  private hotkeySessionStartTime: number | null = null

  constructor() {
    log.info(`[Analytics] Service initialized (enabled: ${this.isInitialized})`)
  }

  /**
   * Enable analytics (re-initialize if needed)
   */
  enableAnalytics() {
    if (!this.isInitialized && import.meta.env.VITE_AMPLITUDE_API_KEY) {
      try {
        init(import.meta.env.VITE_AMPLITUDE_API_KEY, {
          autocapture: {
            elementInteractions: false,
            pageViews: false,
            sessions: true,
            formInteractions: false,
            fileDownloads: false,
          },
        })
        this.isInitialized = true
        log.info('[Analytics] Analytics enabled and initialized')
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
    this.hotkeySessionStartTime = null
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

        const identifyObj = new Identify()

        // Set user properties using the Identify object
        identifyObj.set('user_id', userId)
        identifyObj.set('last_active', new Date().toISOString())

        // Set additional properties
        Object.entries(properties).forEach(([key, value]) => {
          if (value !== undefined) {
            identifyObj.set(key, value)
          }
        })

        identify(identifyObj, { user_id: userId })
        setUserId(userId)
        log.info('[Analytics] User identified:', userId)
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
      const identifyObj = new Identify()

      Object.entries(properties).forEach(([key, value]) => {
        if (value !== undefined) {
          identifyObj.set(key, value)
        }
      })

      identify(identifyObj, { user_id: this.currentUserId })
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
      log.info(
        `[Analytics] Event '${eventName}' skipped - analytics disabled or self-hosted user`,
      )
      return
    }

    try {
      const eventProperties = {
        timestamp: new Date().toISOString(),
        session_duration_ms: Date.now() - this.sessionStartTime,
        ...properties,
      }

      const trackOptions = this.currentUserId
        ? { user_id: this.currentUserId }
        : undefined
      track(eventName, eventProperties, trackOptions)
      log.info(`[Analytics] Event tracked: ${eventName}`)
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
   * Track hotkey events
   */
  trackHotkey(
    eventName: Extract<
      AnalyticsEvent,
      | 'hotkey_pressed'
      | 'hotkey_released'
      | 'hotkey_session_started'
      | 'hotkey_session_ended'
    >,
    properties: HotkeyEventProperties,
  ) {
    // Calculate session duration for hotkey sessions
    if (
      eventName === ANALYTICS_EVENTS.HOTKEY_PRESSED &&
      !this.hotkeySessionStartTime
    ) {
      this.hotkeySessionStartTime = Date.now()
    } else if (
      eventName === ANALYTICS_EVENTS.HOTKEY_RELEASED &&
      this.hotkeySessionStartTime
    ) {
      properties.duration_ms = Date.now() - this.hotkeySessionStartTime
      this.hotkeySessionStartTime = null
    }

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
      // Note: Node.js SDK doesn't have a reset function, so we just clear local state
      this.currentUserId = null
      this.currentProvider = null
      this.hotkeySessionStartTime = null
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
