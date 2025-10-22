import type { FastifyInstance } from 'fastify'
import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs'

/**
 * Timing analytics types for server
 *
 * IMPORTANT: Keep in sync with lib/types/timing.ts
 * These types are duplicated because client and server are separate build artifacts
 */
type TimingEvent = {
  name: string
  start_ms: number
  end_ms?: number
  duration_ms?: number
}

type TimingReport = {
  interaction_id: string
  user_id: string
  platform: string
  timestamp: string
  events: TimingEvent[]
  total_duration_ms: number
}

export const registerTimingRoutes = async (
  fastify: FastifyInstance,
  options: { requireAuth: boolean; timingLogGroupName?: string | null },
) => {
  const { requireAuth, timingLogGroupName } = options

  const logsClient = timingLogGroupName ? new CloudWatchLogsClient({}) : null
  const logStreamName = timingLogGroupName
    ? `timing-analytics-${new Date().toISOString().slice(0, 10)}`
    : null
  let nextSequenceToken: string | undefined

  const ensureStream = async () => {
    if (!logsClient || !timingLogGroupName || !logStreamName) return
    try {
      await logsClient.send(
        new CreateLogStreamCommand({
          logGroupName: timingLogGroupName,
          logStreamName,
        }),
      )
    } catch (err: any) {
      if (err?.name !== 'ResourceAlreadyExistsException') {
        throw err
      }
    }
    const desc = await logsClient.send(
      new DescribeLogStreamsCommand({
        logGroupName: timingLogGroupName,
        logStreamNamePrefix: logStreamName,
        limit: 1,
      }),
    )
    const stream = desc.logStreams?.[0]
    nextSequenceToken = stream?.uploadSequenceToken
  }

  await ensureStream()

  fastify.post('/timing', async (request, reply) => {
    const body = request.body as { reports?: TimingReport[] } | undefined

    if (!body || !Array.isArray(body.reports)) {
      reply
        .code(400)
        .send({ error: 'Invalid body: { reports: TimingReport[] }' })
      return
    }

    const reports = body.reports
    const userSub = (requireAuth && (request as any).user?.sub) || undefined

    const now = Date.now()
    const entries = reports.map(report => {
        const structured = {
          '@timestamp': new Date().toISOString(),
          event: {
            dataset: 'ito-timing-analytics',
          },
          interaction_id: report.interaction_id,
          user_id: userSub || report.user_id,
          platform: report.platform,
          timestamp: report.timestamp,
          total_duration_ms: report.total_duration_ms,
          events: report.events,
        }
        return {
          timestamp: now,
          message: JSON.stringify(structured),
        }
    })

    if (!logsClient || !timingLogGroupName || !logStreamName) {
      for (const e of entries) {
        try {
          process.stdout.write(`${e.message}\n`)
        } catch (err) {
          fastify.log.error({ err }, 'Failed to write timing data to stdout')
        }
      }
      reply.code(204).send()
      return
    }

    try {
      entries.sort((a, b) => a.timestamp - b.timestamp)
      const params = {
        logGroupName: timingLogGroupName,
        logStreamName,
        logEvents: entries,
        sequenceToken: nextSequenceToken,
      }
      const res = await logsClient.send(new PutLogEventsCommand(params))
      nextSequenceToken = res.nextSequenceToken
    } catch (err: any) {
      if (err?.name === 'InvalidSequenceTokenException') {
        await ensureStream()
        const res = await logsClient.send(
          new PutLogEventsCommand({
            logGroupName: timingLogGroupName!,
            logStreamName,
            logEvents: entries,
            sequenceToken: nextSequenceToken,
          }),
        )
        nextSequenceToken = res.nextSequenceToken
      } else {
        fastify.log.error({ err }, 'Failed to put timing data to CloudWatch')
      }
    }

    reply.code(204).send()
  })
}
