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
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Configuration for S3
const TIMING_BUCKET = process.env.TIMING_BUCKET
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-west-2' })

if (!TIMING_BUCKET) {
  console.warn('[TimingService] TIMING_BUCKET environment variable not set')
}

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(TimingServiceDesc, {
    async submitTimingReports(
      request: SubmitTimingReportsRequest,
      context: HandlerContext,
    ): Promise<SubmitTimingReportsResponse> {
      if (!TIMING_BUCKET) {
        console.warn(
          '[TimingService] Skipping timing report - no bucket configured',
        )
        return create(SubmitTimingReportsResponseSchema, {})
      }

      const user = context.values.get(kUser)
      const userSub = user?.sub

      // Write each timing report to S3 as a separate JSON file
      const uploadPromises = request.reports.map(async report => {
        const timingData = {
          source: 'client',
          interactionId: report.interactionId,
          userId: userSub || report.userId,
          platform: report.platform,
          appVersion: report.appVersion,
          hostname: report.hostname,
          architecture: report.architecture,
          timestamp: report.timestamp,
          totalDurationMs: report.totalDurationMs,
          events: report.events.map(event => ({
            name: event.name,
            startMs: event.startMs,
            endMs: event.endMs,
            durationMs: event.durationMs,
          })),
        }

        const key = `client/${report.interactionId}/${Date.now()}.json`

        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: TIMING_BUCKET,
              Key: key,
              Body: JSON.stringify(timingData),
              ContentType: 'application/json',
            }),
          )
          console.log(`[TimingService] Uploaded client timing to S3: ${key}`)
        } catch (error) {
          console.error(
            `[TimingService] Failed to upload timing to S3: ${key}`,
            error,
          )
          // Don't throw - we don't want to fail the request if timing upload fails
        }
      })

      // Wait for all uploads to complete
      await Promise.allSettled(uploadPromises)

      return create(SubmitTimingReportsResponseSchema, {})
    },
  })
}
