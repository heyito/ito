import { PostHog } from 'posthog-node'
import log from 'electron-log'
import { STORE_KEYS } from '../constants/store-keys'
import store from './store'
import type {
  BaseEventProperties,
  UserProperties,
  AnalyticsEvent,
} from '../types/analytics'

/**
 * Main Process Analytics Service for Ito
 * Handles all analytics tracking with PostHog Node.js SDK
 */
class MainAnalyticsService {
  private posthogClient: PostHog | null = null
  private isInitialized: boolean = false
  private currentUserId: string | null = null
  private currentProvider: string | null = null
  private sessionStartTime: number = Date.now()
  private deviceId: string | null = null

  constructor() {
    log.info('[Main Analytics] Service initialized')
  }

  /**
   * Check if analytics should be enabled
   */
  private getAnalyticsEnabled(): boolean {
    // Access environment variables through import.meta.env (Electron main process)
    const apiKey =
      import.meta.env?.VITE_POSTHOG_API_KEY || process.env.VITE_POSTHOG_API_KEY
    const host =
      import.meta.env?.VITE_POSTHOG_HOST || process.env.VITE_POSTHOG_HOST

    // First check if API key and host are available
    if (!apiKey || !host) {
      log.warn(
        '[Main Analytics] PostHog API key or host not found, analytics disabled',
      )
      return false
    }

    // Then check user settings
    try {
      const settings = store.get(STORE_KEYS.SETTINGS)
      const shareAnalytics = settings?.shareAnalytics ?? true
      log.info('[Main Analytics] Settings check:', { shareAnalytics })
      return shareAnalytics
    } catch (error) {
      log.warn(
        '[Main Analytics] Could not read settings, defaulting to enabled:',
        error,
      )
      return true
    }
  }

  /**
   * Initialize PostHog client
   */
  async initialize(deviceId: string): Promise<boolean> {
    if (!this.getAnalyticsEnabled()) {
      log.info(
        '[Main Analytics] PostHog disabled by user settings or missing env vars',
      )
      return false
    }

    try {
      this.deviceId = deviceId

      const apiKey =
        import.meta.env?.VITE_POSTHOG_API_KEY ||
        process.env.VITE_POSTHOG_API_KEY
      const host =
        import.meta.env?.VITE_POSTHOG_HOST || process.env.VITE_POSTHOG_HOST

      if (!apiKey || !host) {
        log.error(
          '[Main Analytics] Missing PostHog credentials during initialization',
        )
        return false
      }

      this.posthogClient = new PostHog(apiKey, {
        host: host,
        disableGeoip: false,
        personalApiKey: undefined,
      })

      this.isInitialized = true

      log.info(
        '[Main Analytics] PostHog initialized successfully with device ID:',
        deviceId,
      )
      return true
    } catch (error) {
      log.error('[Main Analytics] Failed to initialize PostHog:', error)
      return false
    }
  }

  /**
   * Enable analytics (re-initialize if needed)
   */
  async enableAnalytics(deviceId: string): Promise<boolean> {
    const apiKey =
      import.meta.env?.VITE_POSTHOG_API_KEY || process.env.VITE_POSTHOG_API_KEY
    const host =
      import.meta.env?.VITE_POSTHOG_HOST || process.env.VITE_POSTHOG_HOST

    if (!this.isInitialized && apiKey && host) {
      return await this.initialize(deviceId)
    }
    return this.isInitialized
  }

  /**
   * Disable analytics
   */
  disableAnalytics(): void {
    this.isInitialized = false
    this.currentUserId = null
    this.currentProvider = null
    if (this.posthogClient) {
      this.posthogClient.shutdown()
      this.posthogClient = null
    }
    log.info('[Main Analytics] PostHog analytics disabled')
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
  ): void {
    log.info('[Main Analytics] identifyUser called:', userId, provider)

    // Store provider information
    if (provider) {
      this.currentProvider = provider
    }

    if (!this.shouldTrack() || !this.posthogClient) {
      log.info(
        '[Main Analytics] User identification skipped - analytics disabled or self-hosted user',
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

        this.posthogClient.identify({
          distinctId: userId,
          properties: cleanProperties,
        })

        log.info(
          `[Main Analytics] User identified: ${userId} (deviceId: ${this.deviceId})`,
        )
      }
    } catch (error) {
      log.error('[Main Analytics] Failed to identify user:', error)
    }
  }

  /**
   * Update user properties
   */
  updateUserProperties(properties: Partial<UserProperties>): void {
    if (!this.shouldTrack() || !this.currentUserId || !this.posthogClient) {
      log.info(
        '[Main Analytics] User properties update skipped - analytics disabled, self-hosted user, or user not identified',
      )
      return
    }

    try {
      // Remove undefined values
      const cleanProperties = Object.fromEntries(
        Object.entries(properties).filter(([, value]) => value !== undefined),
      )

      this.posthogClient.identify({
        distinctId: this.currentUserId,
        properties: cleanProperties,
      })

      log.info('[Main Analytics] User properties updated')
    } catch (error) {
      log.error('[Main Analytics] Failed to update user properties:', error)
    }
  }

  /**
   * Track a generic event
   */
  track(eventName: AnalyticsEvent, properties: BaseEventProperties = {}): void {
    if (!this.shouldTrack() || !this.posthogClient) {
      return
    }

    try {
      const eventProperties = {
        timestamp: new Date().toISOString(),
        session_duration_ms: Date.now() - this.sessionStartTime,
        ...properties,
      }

      const distinctId = this.currentUserId || this.deviceId || 'anonymous'

      this.posthogClient.capture({
        distinctId,
        event: eventName,
        properties: eventProperties,
      })

      log.info(
        `[Main Analytics] Event tracked: ${eventName} (deviceId: ${this.deviceId}, userId: ${this.currentUserId || 'anonymous'})`,
      )
    } catch (error) {
      log.error(`[Main Analytics] Failed to track event ${eventName}:`, error)
    }
  }

  /**
   * Reset analytics (for logout)
   */
  resetUser(): void {
    if (!this.isInitialized) {
      log.info('[Main Analytics] User reset skipped - analytics disabled')
      return
    }

    try {
      // PostHog Node.js SDK doesn't have a reset function, so we clear local state
      this.currentUserId = null
      this.currentProvider = null
      log.info('[Main Analytics] User session reset')
    } catch (error) {
      log.error('[Main Analytics] Failed to reset user session:', error)
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
   * Check if analytics should be tracked based on provider
   */
  private shouldTrack(): boolean {
    if (!this.isInitialized) {
      return false
    }

    // Skip tracking for self-hosted users
    if (this.currentProvider === 'self-hosted') {
      log.info('[Main Analytics] Tracking skipped - self-hosted user')
      return false
    }

    return true
  }

  /**
   * Update analytics settings
   */
  updateSettings(shareAnalytics: boolean, deviceId: string): void {
    if (shareAnalytics && !this.isEnabled()) {
      this.enableAnalytics(deviceId)
      log.info('[Main Analytics] PostHog analytics enabled by settings change')
    } else if (!shareAnalytics && this.isEnabled()) {
      this.disableAnalytics()
      log.info('[Main Analytics] PostHog analytics disabled by settings change')
    }
  }
}

// Export singleton instance
export const mainAnalyticsService = new MainAnalyticsService()
