import type { ConnectRouter } from '@connectrpc/connect'
import {
  TimingService as TimingServiceDesc,
  SubmitTimingReportsRequest,
  SubmitTimingReportsResponse,
  SubmitTimingReportsResponseSchema,
} from '../../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'
import { kUser } from '../../auth/userContext.js'
import { CloudWatchLogger } from '../cloudWatchLogger.js'

// Configuration for CloudWatch
const TIMING_LOG_GROUP_NAME = process.env.TIMING_LOG_GROUP_NAME || null
const cloudWatchLogger = new CloudWatchLogger(
  TIMING_LOG_GROUP_NAME,
  'timing-analytics',
)

// Initialize stream on startup
await cloudWatchLogger.ensureStream()

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(TimingServiceDesc, {
    async submitTimingReports(
      request: SubmitTimingReportsRequest,
      context: HandlerContext,
    ): Promise<SubmitTimingReportsResponse> {
      const user = context.values.get(kUser)
      const userSub = user?.sub

      const now = Date.now()
      const entries = request.reports.map(report => {
        const structured = {
          '@timestamp': report.timestamp,
          event: {
            dataset: 'ito-timing-analytics',
          },
          interaction_id: report.interactionId,
          user_id: userSub || report.userId,
          platform: report.platform,
          app_version: report.appVersion,
          hostname: report.hostname,
          architecture: report.architecture,
          timestamp: report.timestamp,
          total_duration_ms: report.totalDurationMs,
          events: report.events.map(event => ({
            name: event.name,
            start_ms: event.startMs,
            end_ms: event.endMs,
            duration_ms: event.durationMs,
          })),
        }
        return {
          timestamp: now,
          message: JSON.stringify(structured),
        }
      })

      // Try to send to CloudWatch, fallback to stdout
      const sent = await cloudWatchLogger.sendLogs(entries)

      if (!sent) {
        // No CloudWatch configured, log to stdout
        for (const e of entries) {
          try {
            process.stdout.write(`${e.message}\n`)
          } catch (err) {
            console.error('Failed to write timing data to stdout:', err)
          }
        }
      }

      return create(SubmitTimingReportsResponseSchema, {})
    },
  })
}
