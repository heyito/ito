import { performance } from 'perf_hooks'
import { S3StorageClient } from '../../clients/s3storageClient.js'

/**
 * Enum for server-side timing events in the transcription pipeline
 */
export enum ServerTimingEventName {
  STREAM_COLLECTION = 'server_stream_collection',
  AUDIO_PROCESSING = 'server_audio_processing',
  ASR_TRANSCRIPTION = 'server_asr_transcription',
  LLM_ADJUSTMENT = 'server_llm_adjustment',
  TOTAL_PROCESSING = 'server_total_processing',
}

// Configuration for S3
const TIMING_BUCKET = process.env.TIMING_BUCKET

// Initialize storage client for timing bucket
let timingStorageClient: S3StorageClient | null = null
if (TIMING_BUCKET) {
  try {
    timingStorageClient = new S3StorageClient(TIMING_BUCKET)
  } catch (error) {
    console.error(
      '[ServerTimingCollector] Failed to initialize timing storage client:',
      error,
    )
  }
}

interface TimingEvent {
  name: string
  startMs: number
  endMs?: number
  durationMs?: number
}

interface TimingReport {
  interactionId: string
  userId: string
  events: TimingEvent[]
  source: 'server'
}

interface ActiveTiming {
  interactionId: string
  userId: string
  startTimestamp: string
  events: Map<ServerTimingEventName, TimingEvent>
}

/**
 * ServerTimingCollector for collecting server-side transcription pipeline timing data
 */
export class ServerTimingCollector {
  private activeTimings = new Map<string, ActiveTiming>()
  private completedReports: TimingReport[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private FIRST_EVENT = ServerTimingEventName.TOTAL_PROCESSING

  // Configuration - more aggressive flushing for server to reduce memory
  private readonly FLUSH_INTERVAL_MS = 2_000 // 2 seconds
  private readonly BATCH_SIZE = 5 // Smaller batches
  private readonly MAX_QUEUE_SIZE = 50

  constructor() {
    this.scheduleFlush()
    console.log('[ServerTimingCollector] Service initialized')
  }

  /**
   * Start a new timing session for a transcription request
   */
  startInteraction(interactionId?: string, userId?: string) {
    if (!interactionId) {
      console.warn(
        '[ServerTimingCollector] Cannot start timing: no interaction ID provided',
      )
      return
    }

    this.activeTimings.set(interactionId, {
      interactionId,
      userId: userId || 'unknown',
      startTimestamp: new Date().toISOString(),
      events: new Map(),
    })
  }

  /**
   * Start timing for a specific event
   */
  startTiming(eventName: ServerTimingEventName, interactionId?: string) {
    if (!interactionId) {
      return
    }

    const active = this.activeTimings.get(interactionId)
    if (!active) {
      console.warn(
        `[ServerTimingCollector] Cannot start timing for unknown interaction: ${interactionId}`,
      )
      return
    }

    const timingEvent: TimingEvent = {
      name: eventName,
      startMs: performance.now(),
    }
    active.events.set(eventName, timingEvent)
  }

  /**
   * End timing for a specific event
   */
  endTiming(eventName: ServerTimingEventName, interactionId?: string) {
    if (!interactionId) {
      return
    }

    const active = this.activeTimings.get(interactionId)
    if (!active) {
      console.warn(
        `[ServerTimingCollector] Cannot end timing for unknown interaction: ${interactionId}`,
      )
      return
    }

    const timingEvent = active.events.get(eventName)
    if (!timingEvent) {
      console.warn(
        `[ServerTimingCollector] Cannot end timing for unknown event: ${eventName}`,
      )
      return
    }

    timingEvent.endMs = performance.now()
    timingEvent.durationMs = timingEvent.endMs - timingEvent.startMs
  }

  /**
   * Finalize an interaction and move it to completed reports
   */
  finalizeInteraction(interactionId?: string) {
    if (!interactionId) {
      console.warn(
        '[ServerTimingCollector] Cannot finalize: no interaction ID provided',
      )
      return
    }

    const active = this.activeTimings.get(interactionId)
    if (!active) {
      console.warn(
        `[ServerTimingCollector] Cannot finalize unknown interaction: ${interactionId}`,
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
    const report: TimingReport = {
      interactionId,
      userId: active.userId,
      events,
      source: 'server',
    }

    // Remove from active and add to completed
    this.activeTimings.delete(interactionId)
    this.completedReports.push(report)

    // Enforce max queue size
    if (this.completedReports.length > this.MAX_QUEUE_SIZE) {
      console.warn(
        `[ServerTimingCollector] Queue size exceeded ${this.MAX_QUEUE_SIZE}, dropping oldest reports`,
      )
      this.completedReports = this.completedReports.slice(-this.MAX_QUEUE_SIZE)
    }

    console.log(
      `[ServerTimingCollector] Finalized interaction: ${interactionId} (${events.length} events, ${totalDuration}ms total)`,
    )

    // Check if we should flush
    if (this.completedReports.length >= this.BATCH_SIZE) {
      this.flush()
    }
  }

  /**
   * Clear an interaction without finalizing (for errors/cancellations)
   */
  clearInteraction(interactionId?: string) {
    if (!interactionId) {
      return
    }

    this.activeTimings.delete(interactionId)
    console.log(`[ServerTimingCollector] Cleared interaction: ${interactionId}`)
  }

  /**
   * Flush completed reports to S3
   */
  async flush({ flushAll = false } = {}) {
    if (this.completedReports.length === 0) {
      return
    }

    if (!timingStorageClient) {
      console.warn(
        '[ServerTimingCollector] No timing storage client configured, skipping flush',
      )
      this.completedReports = [] // Clear reports to avoid memory leak
      return
    }

    const reportsToSend = this.completedReports.splice(
      0,
      flushAll ? this.completedReports.length : this.BATCH_SIZE,
    )

    console.log(
      `[ServerTimingCollector] Flushing ${reportsToSend.length} timing reports to S3`,
    )

    // Upload each report to S3
    const uploadPromises = reportsToSend.map(async report => {
      const timingData = {
        source: 'server',
        interactionId: report.interactionId,
        userId: report.userId,
        timestamp: new Date().toISOString(),
        events: report.events.map(event => ({
          name: event.name,
          startMs: event.startMs,
          endMs: event.endMs,
          durationMs: event.durationMs,
        })),
      }

      // S3 key pattern: server/{interaction-id}/{timestamp}.json
      const key = `server/${report.interactionId}/${Date.now()}.json`

      try {
        await timingStorageClient.uploadObject(
          key,
          JSON.stringify(timingData),
          'application/json',
        )
        console.log(
          `[ServerTimingCollector] Uploaded server timing to S3: ${key}`,
        )
      } catch (error) {
        console.error(
          `[ServerTimingCollector] Failed to upload timing to S3: ${key}`,
          error,
        )
        throw error // Will be caught by Promise.allSettled below
      }
    })

    // Wait for all uploads, but don't fail if some fail
    const results = await Promise.allSettled(uploadPromises)

    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failCount = results.filter(r => r.status === 'rejected').length

    if (failCount > 0) {
      console.error(
        `[ServerTimingCollector] Failed to upload ${failCount}/${reportsToSend.length} reports`,
      )
      // Re-add failed reports to the front of the queue for retry
      const failedReports = reportsToSend.filter(
        (_, i) => results[i].status === 'rejected',
      )
      this.completedReports.unshift(...failedReports)
    }

    console.log(
      `[ServerTimingCollector] Successfully submitted ${successCount}/${reportsToSend.length} reports`,
    )
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
    await this.flush({ flushAll: true })

    console.log('[ServerTimingCollector] Service shutdown complete')
  }

  /**
   * Utility function to wrap an async operation with automatic timing
   * Handles both successful and error cases automatically
   */
  async timeAsync<T>(
    eventName: ServerTimingEventName,
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

export const serverTimingCollector = new ServerTimingCollector()
