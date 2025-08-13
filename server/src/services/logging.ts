import type { FastifyInstance } from 'fastify'
import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs'

type LogEvent = {
  ts: number
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'log'
  message: string
  fields?: Record<string, unknown>
  interactionId?: string
  traceId?: string
  spanId?: string
  appVersion?: string
  platform?: string
  source?: string
}

export const registerLoggingRoutes = async (
  fastify: FastifyInstance,
  options: { requireAuth: boolean; clientLogGroupName?: string | null },
) => {
  const { requireAuth, clientLogGroupName } = options

  const logsClient = clientLogGroupName ? new CloudWatchLogsClient({}) : null
  const logStreamName = clientLogGroupName
    ? `${new Date().toLocaleDateString('en-US')}`
    : null
  let nextSequenceToken: string | undefined

  const ensureStream = async () => {
    if (!logsClient || !clientLogGroupName || !logStreamName) return
    try {
      await logsClient.send(
        new CreateLogStreamCommand({
          logGroupName: clientLogGroupName,
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
        logGroupName: clientLogGroupName,
        logStreamNamePrefix: logStreamName,
        limit: 1,
      }),
    )
    const stream = desc.logStreams?.[0]
    nextSequenceToken = stream?.uploadSequenceToken
  }

  await ensureStream()

  fastify.post('/logs', async (request, reply) => {
    const body = request.body as { events?: LogEvent[] } | undefined

    if (!body || !Array.isArray(body.events)) {
      reply.code(400).send({ error: 'Invalid body: { events: LogEvent[] }' })
      return
    }

    const events = body.events
    const userSub = (requireAuth && (request as any).user?.sub) || undefined

    const now = Date.now()
    const entries = events.map(e => {
      const ts = typeof e.ts === 'number' ? e.ts : now
      const level =
        e.level === 'trace' ||
        e.level === 'debug' ||
        e.level === 'info' ||
        e.level === 'warn' ||
        e.level === 'error' ||
        e.level === 'fatal' ||
        e.level === 'log'
          ? e.level
          : 'info'
      const structured = {
        source: e.source || 'client',
        level,
        ts,
        message: e.message,
        fields: e.fields || {},
        interactionId: e.interactionId,
        traceId: e.traceId,
        spanId: e.spanId,
        appVersion: e.appVersion,
        platform: e.platform,
        userSub,
      }
      return {
        timestamp: ts,
        message: JSON.stringify(structured),
      }
    })

    if (!logsClient || !clientLogGroupName || !logStreamName) {
      for (const e of entries) {
        try {
          process.stdout.write(`${e.message}\n`)
        } catch (err) {
          fastify.log.error({ err }, 'Failed to write client log to stdout')
        }
      }
      reply.code(204).send()
      return
    }

    try {
      entries.sort((a, b) => a.timestamp - b.timestamp)
      const params = {
        logGroupName: clientLogGroupName,
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
            logGroupName: clientLogGroupName!,
            logStreamName,
            logEvents: entries,
            sequenceToken: nextSequenceToken,
          }),
        )
        nextSequenceToken = res.nextSequenceToken
      } else {
        fastify.log.error({ err }, 'Failed to put client logs to CloudWatch')
      }
    }

    reply.code(204).send()
  })
}
