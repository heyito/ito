import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

// Simple console exporter
class ConsoleSpanExporter {
  export(spans: any[], resultCallback: (result: any) => void) {
    spans.forEach(span => {
      console.log('[OpenTelemetry]', {
        name: span.name,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        startTime: span.startTime,
        endTime: span.endTime,
        attributes: span.attributes,
        events: span.events,
        status: span.status,
      })
    })
    resultCallback({ code: 0 })
  }

  shutdown(): Promise<void> {
    // No cleanup needed for console exporter
    return Promise.resolve()
  }
}

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource: new Resource({
    'service.name': 'ito-app',
    'service.version': import.meta.env.VITE_ITO_VERSION,
  }),
  spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
})

// Start the SDK
sdk.start()

// Get the tracer
const tracer = trace.getTracer('ito-user-interactions')
class TraceLogger {
  private activeSpans = new Map<string, any>()

  /**
   * Start a new user interaction trace
   */
  startInteraction(step: string, metadata?: Record<string, any>): string {
    const interactionId = crypto.randomUUID()
    const timestamp = Date.now()

    // Create a new span for this interaction
    const span = tracer.startSpan(step, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'interaction.id': interactionId,
        'interaction.start_time': timestamp,
        ...metadata,
      },
    })

    // Store the span for later use
    this.activeSpans.set(interactionId, span)

    // Log the start event
    span.addEvent(`START: ${step}`, {
      interactionId,
      step,
      timestamp,
      ...(metadata ? { ...metadata } : {}),
    })

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
    const span = this.activeSpans.get(interactionId)
    if (!span) {
      console.warn(
        `[TraceLogger] Attempted to log step for unknown interaction: ${interactionId}`,
      )
      return
    }

    const timestamp = Date.now()

    // Add an event to the span with the step name
    span.addEvent(`STEP: ${step}`, {
      step,
      timestamp,
      ...(metadata ? { ...metadata } : {}),
    })

    // Update span attributes with step metadata
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        span.setAttribute(`step.${key}`, String(value))
      })
    }
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
    const span = this.activeSpans.get(interactionId)
    if (!span) {
      console.warn(
        `[TraceLogger] Attempted to end unknown interaction: ${interactionId}`,
      )
      return
    }

    const timestamp = Date.now()

    // Add the end event
    span.addEvent(`END: ${step}`, {
      step,
      timestamp,
      ...(metadata ? { ...metadata } : {}),
      ...(error ? { error } : {}),
    })

    // Set final attributes
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        span.setAttribute(`end.${key}`, String(value))
      })
    }

    if (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error,
      })
      span.recordException(new Error(error))
    } else {
      span.setStatus({ code: SpanStatusCode.OK })
    }

    // End the span
    span.end()

    // Clean up
    this.activeSpans.delete(interactionId)
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
    const span = this.activeSpans.get(interactionId)
    if (!span) {
      console.warn(
        `[TraceLogger] Attempted to log error for unknown interaction: ${interactionId}`,
      )
      return
    }

    const timestamp = Date.now()

    // Add error event
    span.addEvent(`ERROR: ${step}`, {
      step,
      timestamp,
      error,
      ...(metadata ? { ...metadata } : {}),
    })

    // Record the exception
    span.recordException(new Error(error))

    // Set error status
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error,
    })

    // Update span attributes with error metadata
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        span.setAttribute(`error.${key}`, String(value))
      })
    }
  }

  /**
   * Get active interaction count (for debugging)
   */
  getActiveInteractionCount(): number {
    return this.activeSpans.size
  }

  /**
   * Cleanup method to end all active spans (useful for shutdown)
   */
  cleanup(): void {
    this.activeSpans.forEach((span, interactionId) => {
      console.warn(
        `[TraceLogger] Cleaning up active interaction: ${interactionId}`,
      )
      span.end()
    })
    this.activeSpans.clear()
  }
}

// Export singleton instance
export const traceLogger = new TraceLogger()

// Graceful shutdown
process.on('SIGTERM', () => {
  traceLogger.cleanup()
  sdk.shutdown()
})

process.on('SIGINT', () => {
  traceLogger.cleanup()
  sdk.shutdown()
})
