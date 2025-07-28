import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'

export interface TraceContext {
  interactionId: string
  step: string
  timestamp: number
  duration?: number
  metadata?: Record<string, any>
}

export interface TraceEvent {
  interactionId: string
  step: string
  timestamp: number
  duration?: number
  metadata?: Record<string, any>
  error?: string
}

class TraceLogger {
  private activeInteractions = new Map<
    string,
    { startTime: number; steps: TraceEvent[] }
  >()

  /**
   * Start a new user interaction trace
   */
  startInteraction(step: string, metadata?: Record<string, any>): string {
    const interactionId = uuidv4()
    const timestamp = Date.now()

    this.activeInteractions.set(interactionId, {
      startTime: timestamp,
      steps: [],
    })

    const context: TraceContext = {
      interactionId,
      step,
      timestamp,
      metadata,
    }

    this.logTrace('INTERACTION_START', context)
    return interactionId
  }

  /**
   * Log a step within an existing interaction
   */
  logStep(
    interactionId: string,
    step: string,
    metadata?: Record<string, any>,
  ): void {
    const interaction = this.activeInteractions.get(interactionId)
    if (!interaction) {
      log.warn(
        `[TraceLogger] Attempted to log step for unknown interaction: ${interactionId}`,
      )
      return
    }

    const timestamp = Date.now()
    const duration = timestamp - interaction.startTime

    const context: TraceContext = {
      interactionId,
      step,
      timestamp,
      duration,
      metadata,
    }

    this.logTrace('STEP', context)

    // Store the step for later analysis
    interaction.steps.push({
      interactionId,
      step,
      timestamp,
      duration,
      metadata,
    })
  }

  /**
   * End an interaction and log summary
   */
  endInteraction(
    interactionId: string,
    step: string,
    metadata?: Record<string, any>,
    error?: string,
  ): void {
    const interaction = this.activeInteractions.get(interactionId)
    if (!interaction) {
      log.warn(
        `[TraceLogger] Attempted to end unknown interaction: ${interactionId}`,
      )
      return
    }

    const timestamp = Date.now()
    const totalDuration = timestamp - interaction.startTime

    const context: TraceContext = {
      interactionId,
      step,
      timestamp,
      duration: totalDuration,
      metadata,
    }

    this.logTrace('INTERACTION_END', context, error)

    // Log summary if there were multiple steps
    if (interaction.steps.length > 1) {
      this.logInteractionSummary(interactionId, interaction, totalDuration)
    }

    // Clean up
    this.activeInteractions.delete(interactionId)
  }

  /**
   * Log an error within an interaction
   */
  logError(
    interactionId: string,
    step: string,
    error: string,
    metadata?: Record<string, any>,
  ): void {
    const interaction = this.activeInteractions.get(interactionId)
    if (!interaction) {
      log.warn(
        `[TraceLogger] Attempted to log error for unknown interaction: ${interactionId}`,
      )
      return
    }

    const timestamp = Date.now()
    const duration = timestamp - interaction.startTime

    const context: TraceContext = {
      interactionId,
      step,
      timestamp,
      duration,
      metadata,
    }

    this.logTrace('ERROR', context, error)
  }

  private logTrace(
    eventType: string,
    context: TraceContext,
    error?: string,
  ): void {
    const logEntry = {
      eventType,
      interactionId: context.interactionId,
      step: context.step,
      timestamp: context.timestamp,
      duration: context.duration,
      metadata: context.metadata,
      error,
    }

    log.info('[UserInteraction]', JSON.stringify(logEntry))
  }

  private logInteractionSummary(
    interactionId: string,
    interaction: { startTime: number; steps: TraceEvent[] },
    totalDuration: number,
  ): void {
    const summary = {
      interactionId,
      totalDuration,
      stepCount: interaction.steps.length,
      steps: interaction.steps.map(step => ({
        step: step.step,
        duration: step.duration,
        timestamp: step.timestamp,
      })),
    }

    log.info('[UserInteraction] Summary:', JSON.stringify(summary))
  }

  /**
   * Get active interaction count (for debugging)
   */
  getActiveInteractionCount(): number {
    return this.activeInteractions.size
  }
}

// Export singleton instance
export const traceLogger = new TraceLogger()
