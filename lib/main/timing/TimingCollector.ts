import { getCurrentUserId } from '../store'
import { platform, hostname, arch } from 'os'
import { performance } from 'perf_hooks'
import { analytics } from '@/app/components/analytics'
import { app } from 'electron'
import { TimingReport, TimingEvent } from '@/app/generated/ito_pb'
import { grpcClient } from '../../clients/grpcClient'
import { interactionManager } from '../interactions/InteractionManager'

/**
 * Enum for all tracked timing events in the interaction lifecycle
 */
export enum TimingEventName {
  // Core interaction events
  INTERACTION_ACTIVE = 'interaction_active',

  // Server communication
  SERVER_TRANSCRIBE = 'server_transcribe',

  // Context and processing
  CONTEXT_GATHER = 'context_gather',
  GRAMMAR_SERVICE = 'grammar_service',

  // Output
  TEXT_WRITER = 'text_writer',
}

interface ActiveTiming {
  interactionId: string
  startTimestamp: string
  events: Map<TimingEventName, TimingEvent>
}

/**
 * TimingCollector service for collecting and submitting interaction timing data
 * Only collects data if analytics are enabled
 */
export class TimingCollector {
  private activeTimings = new Map<string, ActiveTiming>()
  private completedReports: TimingReport[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private FIRST_EVENT = TimingEventName.INTERACTION_ACTIVE

  // Configuration
  private readonly FLUSH_INTERVAL_MS = 5_000
  private readonly BATCH_SIZE = 10
  private readonly MAX_QUEUE_SIZE = 100

  constructor() {
    this.scheduleFlush()
    console.log('[TimingCollector] Service initialized')
  }

  private shouldCollect(): boolean {
    return analytics.isEnabled()
  }

  /**
   * Start a new timing session for an interaction
   */
  startInteraction(interactionId?: string) {
    if (!this.shouldCollect()) {
      return
    }

    const id = interactionId || interactionManager.getCurrentInteractionId()
    if (!id) {
      console.warn(
        '[TimingCollector] Cannot start timing: no interaction ID available',
      )
      return
    }

    this.activeTimings.set(id, {
      interactionId: id,
      startTimestamp: new Date().toISOString(),
      events: new Map(),
    })
  }

  startTiming(eventName: TimingEventName, interactionId?: string) {
    if (!this.shouldCollect()) {
      return
    }

    const id = interactionId || interactionManager.getCurrentInteractionId()

    if (!id) {
      return
    }

    const active = this.activeTimings.get(id)
    if (!active) {
      console.warn(
        `[TimingCollector] Cannot start timing for unknown interaction: ${id}`,
      )
      return
    }

    const timingEvent = {
      name: eventName,
      startMs: performance.now(),
    } as TimingEvent
    active.events.set(eventName, timingEvent)
  }

  endTiming(eventName: TimingEventName, interactionId?: string) {
    if (!this.shouldCollect()) {
      return
    }

    const id = interactionId || interactionManager.getCurrentInteractionId()

    if (!id) {
      return
    }

    const active = this.activeTimings.get(id)
    if (!active) {
      console.warn(
        `[TimingCollector] Cannot end timing for unknown interaction: ${id}`,
      )
      return
    }

    const timingEvent = active.events.get(eventName)
    if (!timingEvent) {
      console.warn(
        `[TimingCollector] Cannot end timing for unknown event: ${eventName}`,
      )
      return
    }

    timingEvent.endMs = performance.now()
    timingEvent.durationMs = timingEvent.endMs - timingEvent.startMs
  }

  /**
   * Finalize an interaction and move it to completed reports
   * If no interactionId is provided, uses the current interaction from interactionManager
   */
  finalizeInteraction(interactionId?: string) {
    if (!this.shouldCollect()) {
      return
    }

    const id = interactionId || interactionManager.getCurrentInteractionId()
    if (!id) {
      console.warn(
        '[TimingCollector] Cannot finalize: no interaction ID available',
      )
      return
    }

    const active = this.activeTimings.get(id)
    if (!active) {
      console.warn(
        `[TimingCollector] Cannot finalize unknown interaction: ${id}`,
      )
      return
    }

    // Calculate total duration
    const events = Array.from(active.events.values())
    const firstEvent = events.find(e => e.name === this.FIRST_EVENT)
    const lastEvent = events.reduce((latest, event) => {
      const eventEnd = event.endMs || event.startMs
      const latestEnd = latest.endMs || latest.startMs
      return eventEnd > latestEnd ? event : latest
    }, events[0])

    const totalDuration = firstEvent
      ? (lastEvent.endMs || lastEvent.startMs) - firstEvent.startMs
      : 0

    // Create timing report
    const report = {
      interactionId: id,
      userId: getCurrentUserId() || 'unknown',
      platform: platform(),
      appVersion: app.getVersion(),
      hostname: hostname(),
      architecture: arch(),
      timestamp: active.startTimestamp,
      events,
      totalDurationMs: totalDuration,
    } as TimingReport

    // Remove from active and add to completed
    this.activeTimings.delete(id)
    this.completedReports.push(report)

    // Enforce max queue size
    if (this.completedReports.length > this.MAX_QUEUE_SIZE) {
      console.warn(
        `[TimingCollector] Queue size exceeded ${this.MAX_QUEUE_SIZE}, dropping oldest reports`,
      )
      this.completedReports = this.completedReports.slice(-this.MAX_QUEUE_SIZE)
    }

    console.log(
      `[TimingCollector] Finalized interaction: ${id} (${events.length} events, ${totalDuration}ms total)`,
    )

    // Check if we should flush
    if (this.completedReports.length >= this.BATCH_SIZE) {
      this.flush()
    }
  }

  /**
   * Clear an interaction without finalizing (for errors/cancellations)
   * If no interactionId is provided, uses the current interaction from interactionManager
   */
  clearInteraction(interactionId?: string) {
    const id = interactionId || interactionManager.getCurrentInteractionId()
    if (!id) {
      return
    }

    this.activeTimings.delete(id)
    console.log(`[TimingCollector] Cleared interaction: ${id}`)
  }

  /**
   * Flush completed reports to the server via gRPC
   */
  async flush() {
    if (this.completedReports.length === 0) {
      return
    }

    const reportsToSend = this.completedReports.splice(0, this.BATCH_SIZE)

    console.log(
      `[TimingCollector] Flushing ${reportsToSend.length} timing reports to server`,
    )

    try {
      await grpcClient.submitTimingReports(reportsToSend)

      console.log(
        `[TimingCollector] Successfully submitted ${reportsToSend.length} reports`,
      )
    } catch (error) {
      console.error('[TimingCollector] Failed to submit timing data:', error)
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

    console.log('[TimingCollector] Service shutdown complete')
  }

  /**
   * Utility function to wrap an async operation with automatic timing
   * Handles both successful and error cases automatically
   *
   * @example
   * const result = await timingCollector.timeAsync(
   *   interactionId,
   *   TimingEventName.TEXT_WRITER,
   *   async () => await setFocusedText(transcript)
   * )
   */
  async timeAsync<T>(
    eventName: TimingEventName,
    fn: () => Promise<T> | T,
    interactionId?: string,
  ): Promise<T> {
    this.startTiming(eventName, interactionId)
    try {
      const result = await fn()
      return result
    } finally {
      // Always end timing, even if the function throws
      this.endTiming(eventName, interactionId)
    }
  }
}

export const timingCollector = new TimingCollector()
