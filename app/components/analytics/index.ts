import log from 'electron-log'
import { STORE_KEYS } from '../../../lib/constants/store-keys'
import { v4 as uuidv4 } from 'uuid'
import type {
  BaseEventProperties,
  OnboardingEventProperties,
  AuthEventProperties,
  SettingsEventProperties,
  UserProperties,
  AnalyticsEvent,
} from '../../../lib/types/analytics'

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
  // First check if API key and host are available
  if (
    !import.meta.env.VITE_POSTHOG_API_KEY ||
    !import.meta.env.VITE_POSTHOG_HOST
  ) {
    console.warn(
      '[Analytics] PostHog API key or host not found, analytics disabled',
    )
    return false
  }

  // Then check user settings
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

// Initialize analytics state
let isAnalyticsInitialized = false
let sharedDeviceId: string | null = null
const analyticsEnabled = getAnalyticsEnabled()

console.log('VITE_POSTHOG_API_KEY', import.meta.env.VITE_POSTHOG_API_KEY)
console.log('VITE_POSTHOG_HOST', import.meta.env.VITE_POSTHOG_HOST)
console.log('[Analytics] Analytics enabled:', analyticsEnabled)

// Initialize analytics via IPC asynchronously
const initializeAnalytics = async () => {
  if (!analyticsEnabled) {
    log.info('[Analytics] PostHog disabled by user settings')
    return
  }

  try {
    sharedDeviceId = await getSharedDeviceId()
    console.log('[Analytics] Using shared device ID:', sharedDeviceId)

    // Initialize analytics in main process via IPC
    isAnalyticsInitialized =
      (await window.api?.['analytics:initialize'](sharedDeviceId)) || false

    // Update the service instance after successful initialization
    analytics.updateInitializationStatus(isAnalyticsInitialized, sharedDeviceId)

    log.info(
      '[Analytics] PostHog initialized via IPC with shared device ID:',
      sharedDeviceId,
      'Success:',
      isAnalyticsInitialized,
    )

    console.log('[Analytics] Renderer analytics service state:', {
      isInitialized: analytics.isEnabled(),
      deviceId: analytics.getDeviceId(),
      userIdentified: analytics.isUserIdentified(),
    })
  } catch (error) {
    log.error('[Analytics] Failed to initialize analytics via IPC:', error)
  }
}

// Initialize analytics when the module loads
initializeAnalytics()

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
    if (
      !this.isInitialized &&
      import.meta.env.VITE_POSTHOG_API_KEY &&
      import.meta.env.VITE_POSTHOG_HOST
    ) {
      try {
        const deviceId = await getSharedDeviceId()
        this.deviceId = deviceId

        // Enable analytics in main process via IPC
        this.isInitialized =
          (await window.api?.['analytics:enable'](deviceId)) || false

        log.info(
          '[Analytics] Analytics enabled via IPC with shared device ID:',
          deviceId,
          'Success:',
          this.isInitialized,
        )
      } catch (error) {
        log.error('[Analytics] Failed to enable analytics via IPC:', error)
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

    // Disable analytics in main process via IPC
    window.api?.['analytics:disable']()

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

        // Build user properties for PostHog
        const userProperties = {
          user_id: userId,
          last_active: new Date().toISOString(),
          ...properties,
        }

        // Remove undefined values
        const cleanProperties = Object.fromEntries(
          Object.entries(userProperties).filter(
            ([, value]) => value !== undefined,
          ),
        )

        // Identify user in main process via IPC
        window.api?.['analytics:identify-user'](
          userId,
          cleanProperties,
          provider,
        )

        log.info(
          `[Analytics] User identified via IPC: ${userId} (deviceId: ${this.deviceId || 'pending'})`,
        )
      }
    } catch (error) {
      log.error('[Analytics] Failed to identify user via IPC:', error)
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
      // Remove undefined values
      const cleanProperties = Object.fromEntries(
        Object.entries(properties).filter(([, value]) => value !== undefined),
      )

      // Update user properties in main process via IPC
      window.api?.['analytics:update-user-properties'](cleanProperties)

      log.info('[Analytics] User properties updated via IPC')
    } catch (error) {
      log.error('[Analytics] Failed to update user properties via IPC:', error)
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

      // Track event in main process via IPC
      window.api?.['analytics:track'](eventName, eventProperties)

      log.info(
        `[Analytics] Event tracked via IPC: ${eventName} (deviceId: ${this.deviceId || 'pending'}, userId: ${this.currentUserId || 'anonymous'})`,
      )
    } catch (error) {
      log.error(
        `[Analytics] Failed to track event ${eventName} via IPC:`,
        error,
      )
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
      // Reset user in main process via IPC
      window.api?.['analytics:reset-user']()

      // Clear local state
      this.currentUserId = null
      this.currentProvider = null
      log.info('[Analytics] User session reset via IPC')
    } catch (error) {
      log.error('[Analytics] Failed to reset user session via IPC:', error)
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
    const canTrack =
      this.isInitialized && this.currentProvider !== 'self-hosted'
    console.log('[Analytics] shouldTrack check:', {
      isInitialized: this.isInitialized,
      currentProvider: this.currentProvider,
      canTrack: canTrack,
      hasApiKey: !!import.meta.env.VITE_POSTHOG_API_KEY,
      hasHost: !!import.meta.env.VITE_POSTHOG_HOST,
    })

    if (!this.isInitialized) {
      log.info('[Analytics] Tracking skipped - not initialized')
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
export const updateAnalyticsFromSettings = async (shareAnalytics: boolean) => {
  try {
    const deviceId = await getSharedDeviceId()

    // Update analytics settings in main process via IPC
    window.api?.['analytics:update-settings'](shareAnalytics, deviceId)

    if (shareAnalytics && !analytics.isEnabled()) {
      analytics.enableAnalytics()
      log.info('[Analytics] PostHog analytics enabled by settings change')
    } else if (!shareAnalytics && analytics.isEnabled()) {
      analytics.disableAnalytics()
      log.info('[Analytics] PostHog analytics disabled by settings change')
    }
  } catch (error) {
    log.error('[Analytics] Failed to update analytics settings via IPC:', error)
  }
}

// Export convenience functions
export const trackEvent = analytics.track.bind(analytics)
export const identifyUser = analytics.identifyUser.bind(analytics)
export const updateUserProperties =
  analytics.updateUserProperties.bind(analytics)
export const resetAnalytics = analytics.resetUser.bind(analytics)
