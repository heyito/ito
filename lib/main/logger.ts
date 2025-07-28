import log from 'electron-log'
import { app } from 'electron'

export function initializeLogging() {
  // Overriding console methods with electron-log
  Object.assign(console, log.functions)

  // Configure file transport for the packaged app
  if (app.isPackaged) {
    log.transports.file.level = 'trace' // Enable trace level for user interaction logging
    log.transports.file.format =
      '[{y}-{m}-{d} {h}:{i}:{s}.{l}] [{processType}] [{level}] {text}'
  } else {
    // In development, log everything to the console and disable file logging
    log.transports.console.level = 'trace' // Enable trace level for development
    log.transports.file.level = false
  }

  // Set up IPC transport to receive logs from the renderer process
  log.initialize()

  log.info('Logging initialized.')
  if (app.isPackaged) {
    log.info(`Log file is located at: ${log.transports.file.getFile().path}`)
  }
}
