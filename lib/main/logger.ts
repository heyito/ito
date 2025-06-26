import log from 'electron-log'
import { app } from 'electron'

export function initializeLogging() {
  // Overriding console methods with electron-log
  Object.assign(console, log.functions)

  // Configure file transport for the packaged app
  if (app.isPackaged) {
    log.transports.file.level = 'info' // Log 'info' and higher (info, warn, error)
    log.transports.file.format =
      '[{y}-{m}-{d} {h}:{i}:{s}.{l}] [{processType}] [{level}] {text}'
  } else {
    // In development, log everything to the console and disable file logging
    log.transports.console.level = 'debug'
    log.transports.file.level = false
  }

  // Set up IPC transport to receive logs from the renderer process
  log.initialize()

  log.info('Logging initialized.')
  if (app.isPackaged) {
    log.info(`Log file is located at: ${log.transports.file.getFile().path}`)
  }
} 