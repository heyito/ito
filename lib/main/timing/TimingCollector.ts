import log from 'electron-log'
import { analytics } from '../../../app/components/analytics'
import store, { getCurrentUserId } from '../store'
import { STORE_KEYS } from '../../constants/store-keys'
import { platform } from 'os'
import type { TimingEvent, TimingReport } from '../../types/timing'

/**
 * Enum for all tracked timing events in the interaction lifecycle
 */
export enum TimingEventName {
  // Core interaction events
  HOTKEY_PRESS = 'hotkey_press',

  // Server communication
  SERVER_TRANSCRIBE = 'server_transcribe',

  // Context and processing
  CONTEXT_GATHER = 'context_gather',
  GRAMMAR_SERVICE = 'grammar_service',

  // Output
  TEXT_WRITER = 'text_writer',
}

// Re-export shared types with our enum constraint
export type { TimingReport }
export interface TimingEventTyped extends Omit<TimingEvent, 'name'> {
  name: TimingEventName
}

interface ActiveTiming {
  interaction_id: string
  start_timestamp: string
  events: Map<TimingEventName, TimingEventTyped>
}

/**
 * TimingCollector service for collecting and submitting interaction timing data
 * Only collects data if analytics are enabled
 */
export class TimingCollector {
  private activeTimings = new Map<string, ActiveTiming>()
  private completedReports: TimingReport[] = []
  private flushTimer: NodeJS.Timeout | null = null

  // Configuration
  private readonly FLUSH_INTERVAL_MS = 5_000 // 60 seconds
  private readonly BATCH_SIZE = 10
  private readonly MAX_QUEUE_SIZE = 100

  constructor() {
    this.scheduleFlush()
    log.info('[TimingCollector] Service initialized')
  }

  /**
   * Check if timing collection should be active
   */
  private shouldCollect(): boolean {
    // TODO: Fix me for local dev
    // return analytics.isEnabled()
    return true
  }

  /**
   * Start a new timing session for an interaction
   */
  startInteraction(interactionId: string) {
    if (!this.shouldCollect()) {
      return
    }

    this.activeTimings.set(interactionId, {
      interaction_id: interactionId,
      start_timestamp: new Date().toISOString(),
      events: new Map(),
    })

    log.info(`[TimingCollector] Started tracking interaction: ${interactionId}`)
  }

  /**
   * Record the start of a timing event
   */
  startTiming(interactionId: string, eventName: TimingEventName) {
    if (!this.shouldCollect()) {
      return
    }

    const active = this.activeTimings.get(interactionId)
    if (!active) {
      log.warn(
        `[TimingCollector] Cannot start timing for unknown interaction: ${interactionId}`,
      )
      return
    }

    active.events.set(eventName, {
      name: eventName,
      start_ms: Date.now(),
    })
  }

  /**
   * Record the end of a timing event
   */
  endTiming(interactionId: string, eventName: TimingEventName) {
    if (!this.shouldCollect()) {
      return
    }

    const active = this.activeTimings.get(interactionId)
    if (!active) {
      log.warn(
        `[TimingCollector] Cannot end timing for unknown interaction: ${interactionId}`,
      )
      return
    }

    const event = active.events.get(eventName)
    if (!event) {
      log.warn(
        `[TimingCollector] Cannot end timing for unknown event: ${eventName}`,
      )
      return
    }

    event.end_ms = Date.now()
    event.duration_ms = event.end_ms - event.start_ms
  }

  /**
   * Finalize an interaction and move it to completed reports
   */
  finalizeInteraction(interactionId: string) {
    console.log(`Finalizing interaction: ${interactionId}`)
    if (!this.shouldCollect()) {
      console.log('no collecting mf')
      return
    }

    const active = this.activeTimings.get(interactionId)
    console.log({ active })
    if (!active) {
      log.warn(
        `[TimingCollector] Cannot finalize unknown interaction: ${interactionId}`,
      )
      return
    }

    // Calculate total duration
    const events = Array.from(active.events.values())
    const firstEvent = events.find(e => e.name === TimingEventName.HOTKEY_PRESS)
    const lastEvent = events.reduce((latest, event) => {
      const eventEnd = event.end_ms || event.start_ms
      const latestEnd = latest.end_ms || latest.start_ms
      return eventEnd > latestEnd ? event : latest
    }, events[0])

    const totalDuration = firstEvent
      ? (lastEvent.end_ms || lastEvent.start_ms) - firstEvent.start_ms
      : 0

    // Create timing report
    const report: TimingReport = {
      interaction_id: interactionId,
      user_id: getCurrentUserId() || 'unknown',
      platform: platform(),
      timestamp: active.start_timestamp,
      events: events,
      total_duration_ms: totalDuration,
    }

    console.log({ report })

    // Remove from active and add to completed
    this.activeTimings.delete(interactionId)
    this.completedReports.push(report)

    // Enforce max queue size
    if (this.completedReports.length > this.MAX_QUEUE_SIZE) {
      log.warn(
        `[TimingCollector] Queue size exceeded ${this.MAX_QUEUE_SIZE}, dropping oldest reports`,
      )
      this.completedReports = this.completedReports.slice(-this.MAX_QUEUE_SIZE)
    }

    log.info(
      `[TimingCollector] Finalized interaction: ${interactionId} (${events.length} events, ${totalDuration}ms total)`,
    )

    // Check if we should flush
    if (this.completedReports.length >= this.BATCH_SIZE) {
      this.flush()
    }
  }

  /**
   * Clear an interaction without finalizing (for errors/cancellations)
   */
  clearInteraction(interactionId: string) {
    this.activeTimings.delete(interactionId)
    log.info(`[TimingCollector] Cleared interaction: ${interactionId}`)
  }

  /**
   * Flush completed reports to the server
   */
  async flush() {
    console.log('completed reports', this.completedReports)
    if (this.completedReports.length === 0) {
      return
    }

    const reportsToSend = this.completedReports.splice(0, this.BATCH_SIZE)

    log.info(
      `[TimingCollector] Flushing ${reportsToSend.length} timing reports to server`,
    )

    try {
      const serverUrl =
        import.meta.env.VITE_GRPC_BASE_URL || 'http://localhost:3001'
      const payload = { reports: reportsToSend }

      console.log('[TimingCollector] Sending payload:', {
        url: `${serverUrl}/timing`,
        reportsCount: reportsToSend.length,
        payload: JSON.stringify(payload, null, 2),
      })

      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const response = await fetch(`${serverUrl}/timing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      console.log('[TimingCollector] Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      })

      if (!response.ok) {
        throw new Error(
          `Timing submission failed: ${response.status} ${response.statusText}`,
        )
      }

      log.info(
        `[TimingCollector] Successfully submitted ${reportsToSend.length} reports`,
      )
    } catch (error) {
      log.error('[TimingCollector] Failed to submit timing data:', error)
      // Re-add reports to the front of the queue for retry
      this.completedReports.unshift(...reportsToSend)
    }
  }

  /**
   * Schedule periodic flushing
   */
  private scheduleFlush() {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        this.flush()
      }, this.FLUSH_INTERVAL_MS)
    }
  }

  /**
   * Stop periodic flushing and flush any remaining reports
   */
  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // Flush any remaining reports
    await this.flush()

    log.info('[TimingCollector] Service shutdown complete')
  }

  /**
   * Get current queue stats (for debugging)
   */
  getStats() {
    return {
      activeInteractions: this.activeTimings.size,
      queuedReports: this.completedReports.length,
      analyticsEnabled: this.shouldCollect(),
    }
  }
}

// Export singleton instance
export const timingCollector = new TimingCollector()
