import type { FastifyInstance } from 'fastify'
import { CloudWatchLogger } from './cloudWatchLogger.js'

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
  options: {
    requireAuth: boolean
    showClientLogs: boolean
    clientLogGroupName?: string | null
  },
) => {
  const { requireAuth, showClientLogs, clientLogGroupName } = options

  const cloudWatchLogger = new CloudWatchLogger(clientLogGroupName)
  await cloudWatchLogger.ensureStream()

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

    const sent = await cloudWatchLogger.sendLogs(entries)

    if (!sent) {
      if (!showClientLogs) {
        reply.code(204).send()
        return
      }
      for (const e of entries) {
        try {
          process.stdout.write(`${e.message}\n`)
        } catch (err) {
          fastify.log.error({ err }, 'Failed to write client log to stdout')
        }
      }
    }

    reply.code(204).send()
  })
}
