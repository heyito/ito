type FirehoseRecord = {
  recordId: string
  data: string
}

type FirehoseResponseRecord = {
  recordId: string
  result: 'Ok' | 'Dropped' | 'ProcessingFailed'
  data: string
}

type FirehoseEvent = {
  records: FirehoseRecord[]
}

type CwLogEvent = {
  id?: string
  timestamp?: number
  message?: unknown
  owner?: string
  logGroup?: string
  logStream?: string
  subscriptionFilters?: string[]
}

const DATASET = process.env.DATASET || 'server'
const STAGE = process.env.STAGE || 'dev'

function tryJsonParse<T>(text: unknown): T | undefined {
  if (typeof text !== 'string') return undefined
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return undefined
  try {
    return JSON.parse(t) as T
  } catch {
    return undefined
  }
}

function base64ToUtf8(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8')
}

function utf8ToBase64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
}

function isoTimestamp(ms?: number): string {
  const n = typeof ms === 'number' ? ms : Date.now()
  return new Date(n).toISOString()
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

export const handler = async (
  event: FirehoseEvent,
): Promise<{ records: FirehoseResponseRecord[] }> => {
  const results: FirehoseResponseRecord[] = []

  for (const rec of event.records) {
    try {
      const raw = base64ToUtf8(rec.data)
      const wrapper = tryJsonParse<CwLogEvent>(raw)

      let logGroup: string | undefined
      let logStream: string | undefined
      let ts: number | undefined
      let originalMessage: unknown = raw

      if (wrapper && typeof wrapper === 'object') {
        logGroup = wrapper.logGroup
        logStream = wrapper.logStream
        ts = wrapper.timestamp
        originalMessage = wrapper.message
      }

      const messageStr =
        typeof originalMessage === 'string'
          ? originalMessage
          : String(originalMessage)

      const structured = tryJsonParse<any>(messageStr)

      let doc: Record<string, unknown>
      if (
        structured &&
        typeof structured === 'object' &&
        ('message' in structured || 'level' in structured)
      ) {
        // Treat as structured client log
        doc = clean({
          '@timestamp': isoTimestamp(
            typeof structured.ts === 'number' ? structured.ts : ts,
          ),
          'log.level': structured.level || 'info',
          message: structured.message ?? messageStr,
          fields: structured.fields || {},
          'interaction.id': structured.interactionId,
          'trace.id': structured.traceId,
          'span.id': structured.spanId,
          'service.name': 'ito',
          'service.version': structured.appVersion,
          platform: structured.platform,
          'user.sub': structured.userSub,
          'event.dataset': DATASET,
          stage: STAGE,
          'log.group': logGroup,
          'log.stream': logStream,
        })
      } else {
        // Console/plain log line
        doc = clean({
          '@timestamp': isoTimestamp(ts),
          'log.level': 'info',
          message: messageStr,
          fields: {},
          'event.dataset': DATASET,
          stage: STAGE,
          'service.name': 'ito',
          'log.group': logGroup,
          'log.stream': logStream,
        })
      }

      const outLine = JSON.stringify(doc)
      results.push({
        recordId: rec.recordId,
        result: 'Ok',
        data: utf8ToBase64(outLine),
      })
    } catch {
      results.push({
        recordId: rec.recordId,
        result: 'ProcessingFailed',
        data: rec.data,
      })
    }
  }

  return { records: results }
}
