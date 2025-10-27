import log from 'electron-log'
import { app } from 'electron'
import os from 'os'
import store, { getCurrentUserId } from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { interactionManager } from './interactions/InteractionManager'

export function initializeLogging() {
  // Overriding console methods with electron-log
  Object.assign(console, log.functions)

  // Configure file transport for the packaged app
  if (app.isPackaged) {
    log.transports.file.level = 'info' // Log 'info' and higher (info, warn, error)
    log.transports.file.format =
      '[{y}-{m}-{d} {h}:{i}:{s}.{l}] [{processType}] [{level}] {text}'
  } else {
    log.transports.console.level = 'debug'
    log.transports.file.level = false
  }

  // Set up IPC transport to receive logs from the renderer process
  log.initialize()

  log.info('Logging initialized.')
  if (app.isPackaged) {
    log.info(`Log file is located at: ${log.transports.file.getFile().path}`)
  }

  // Add remote transport to batch-forward client logs to server
  type LogEvent = {
    ts: number
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'log'
    message: string
    fields?: Record<string, unknown>
    interactionId: string | null
    traceId?: string
    spanId?: string
    appVersion?: string
    platform?: string
    source?: string
    loggedAtIso: string
  }

  const MAX_QUEUE = 5000
  const initialEvents =
    (store.get('log_queue:events') as LogEvent[] | undefined) ?? []
  const queue: LogEvent[] = [...initialEvents]

  const persistQueue = () => {
    store.set('log_queue:events', queue)
  }
  let isSending = false
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const flush = async () => {
    if (isSending || queue.length === 0) return
    isSending = true
    const take = Math.min(50, queue.length)
    const batch = queue.slice(0, take)
    try {
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      if (!baseUrl) return

      const url = new URL('/logs', baseUrl)
      const body = {
        events: batch,
      }
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.ok || res.status === 204) {
        // Remove sent items only on success
        queue.splice(0, take)
        persistQueue()
      }
    } catch {
      // Keep items in queue on failure; they remain persisted
    } finally {
      isSending = false
    }
  }

  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(async () => {
      flushTimer = null
      await flush()
      if (queue.length > 0) {
        // If more remain, schedule another cycle
        scheduleFlush()
      }
    }, 2000)
  }

  const toEvent = (
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'log',
    message: string,
    fields?: Record<string, unknown>,
  ) => {
    const userId = getCurrentUserId()
    const interactionId = interactionManager.getCurrentInteractionId()
    const now = Date.now()
    const event: LogEvent = {
      ts: now,
      loggedAtIso: new Date(now).toISOString(),
      level,
      message,
      fields: {
        ...fields,
        userId,
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
      },
      interactionId,
      appVersion: app.getVersion?.() ?? 'unknown',
      platform: `${process.platform}-${process.arch}`,
      source: 'client',
    }
    return event
  }

  // Wrap core log methods to enqueue events
  const originalInfo = console.info
  const originalWarn = console.warn
  const originalError = console.error
  const originalLog = console.log

  console.log = (...args: any[]) => {
    try {
      queue.push(toEvent('log', String(args[0] ?? ''), { args }))
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
      persistQueue()
      scheduleFlush()
    } catch (err) {
      originalError('Failed to enqueue log event (log):', err)
    }
    originalLog.apply(console, args as any)
  }
  console.info = (...args: any[]) => {
    try {
      queue.push(toEvent('info', String(args[0] ?? ''), { args }))
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
      persistQueue()
      scheduleFlush()
    } catch (err) {
      originalError('Failed to enqueue log event (info):', err)
    }
    originalInfo.apply(console, args as any)
  }
  console.warn = (...args: any[]) => {
    try {
      queue.push(toEvent('warn', String(args[0] ?? ''), { args }))
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
      persistQueue()
      scheduleFlush()
    } catch (err) {
      originalError('Failed to enqueue log event (warn):', err)
    }
    originalWarn.apply(console, args as any)
  }
  console.error = (...args: any[]) => {
    try {
      queue.push(toEvent('error', String(args[0] ?? ''), { args }))
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
      persistQueue()
      scheduleFlush()
    } catch (err) {
      originalError('Failed to enqueue log event (error):', err)
    }
    originalError.apply(console, args as any)
  }

  // Also wrap electron-log methods (log.info, log.warn, etc.) so direct calls are sent
  const levelMap: Record<string, 'debug' | 'info' | 'warn' | 'error'> = {
    verbose: 'debug',
    silly: 'debug',
    debug: 'debug',
    info: 'info',
    log: 'info',
    warn: 'warn',
    error: 'error',
  }
  ;(
    ['info', 'warn', 'error', 'debug', 'verbose', 'silly', 'log'] as const
  ).forEach(method => {
    const original = (log as any)[method]?.bind(log)
    if (typeof original !== 'function') return
    ;(log as any)[method] = (...args: any[]) => {
      try {
        const mapped = levelMap[method] || 'info'
        queue.push(toEvent(mapped as any, String(args[0] ?? ''), { args }))
        if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
        persistQueue()
        scheduleFlush()
      } catch (err) {
        originalError(`Failed to enqueue electron-log event (${method}):`, err)
      }
      return original(...args)
    }
  })

  // Best-effort flush when the app is quitting; durability is ensured by persistence
  app.on('before-quit', () => {
    void flush()
  })

  // If there are persisted events on startup, schedule an initial flush
  if (queue.length > 0) {
    scheduleFlush()
  }
}
