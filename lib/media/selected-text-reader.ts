import { spawn } from 'child_process'
import { platform, arch } from 'os'
import { getNativeBinaryPath } from './native-interface'
import log from 'electron-log'
import { EventEmitter } from 'events'
interface SelectedTextOptions {
  format?: 'json' | 'text' // Output format
  maxLength?: number // Maximum length of text to return
}

interface SelectedTextResult {
  success: boolean
  text: string | null
  error: string | null
  length: number
}

interface SelectedTextCommand {
  command: 'get-text'
  format?: 'json' | 'text'
  maxLength?: number
  requestId: string
}

const nativeModuleName = 'selected-text-reader'

class SelectedTextReaderService extends EventEmitter {
  #selectedTextProcess: ReturnType<typeof spawn> | null = null
  #pendingRequests = new Map<
    string,
    {
      resolve: (value: SelectedTextResult) => void
      reject: (reason?: any) => void
    }
  >()
  #requestIdCounter = 0

  constructor() {
    super()
  }

  /**
   * Spawns and initializes the native selected-text-reader process.
   */
  public initialize(): void {
    if (this.#selectedTextProcess) {
      log.warn('[SelectedTextService] Selected text reader already running.')
      return
    }

    const binaryPath = getNativeBinaryPath(nativeModuleName)
    if (!binaryPath) {
      log.error(
        `[SelectedTextService] Cannot determine ${nativeModuleName} binary path for platform ${platform()} and arch ${arch()}`,
      )
      this.emit('error', new Error('Selected text reader binary not found.'))
      return
    }

    log.info(
      `[SelectedTextService] Spawning selected text reader at: ${binaryPath}`,
    )
    try {
      this.#selectedTextProcess = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (!this.#selectedTextProcess) {
        throw new Error('Failed to spawn process')
      }

      this.#selectedTextProcess.stdout?.on('data', this.#onData.bind(this))
      this.#selectedTextProcess.stderr?.on('data', this.#onStdErr.bind(this))
      this.#selectedTextProcess.on('close', this.#onClose.bind(this))
      this.#selectedTextProcess.on('error', this.#onError.bind(this))

      log.info('[SelectedTextService] Selected text reader process started.')
    } catch (err) {
      log.error(
        '[SelectedTextService] Caught an error while spawning selected text reader:',
        err,
      )
      this.#selectedTextProcess = null
      this.emit('error', err)
    }
  }

  /**
   * Stops the native selected-text-reader process.
   */
  public terminate(): void {
    if (this.#selectedTextProcess) {
      log.info('[SelectedTextService] Stopping selected text reader process.')
      this.#selectedTextProcess.kill()
      this.#selectedTextProcess = null
      this.emit('stopped')

      // Reject all pending requests
      this.#pendingRequests.forEach(({ reject }) => {
        reject(new Error('Service terminated'))
      })
      this.#pendingRequests.clear()
    }
  }

  /**
   * Sends a command to get selected text.
   */
  public async getSelectedText(
    options: SelectedTextOptions = { format: 'json', maxLength: 10000 },
  ): Promise<SelectedTextResult> {
    if (!this.#selectedTextProcess) {
      throw new Error('Selected text reader process not running')
    }

    return new Promise((resolve, reject) => {
      const requestId = `req_${++this.#requestIdCounter}_${Date.now()}`
      this.#pendingRequests.set(requestId, { resolve, reject })

      const command: SelectedTextCommand = {
        command: 'get-text',
        format: options.format || 'json',
        maxLength: options.maxLength || 10000,
        requestId,
      }

      this.#sendCommand(command)

      // Set timeout to avoid hanging requests
      setTimeout(() => {
        if (this.#pendingRequests.has(requestId)) {
          this.#pendingRequests.delete(requestId)
          reject(new Error('Selected text request timed out'))
        }
      }, 5000) // 5 second timeout
    })
  }

  #sendCommand(command: SelectedTextCommand): void {
    if (!this.#selectedTextProcess) {
      log.error(
        '[SelectedTextService] Cannot send command, process not running',
      )
      return
    }

    try {
      const commandStr = JSON.stringify(command) + '\n'
      this.#selectedTextProcess.stdin?.write(commandStr)
      log.debug(`[SelectedTextService] Sent command: ${commandStr.trim()}`)
    } catch (error) {
      log.error('[SelectedTextService] Error sending command:', error)
    }
  }

  #onData(data: Buffer): void {
    const lines = data.toString().trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const response = JSON.parse(line)

        if (
          response.requestId &&
          this.#pendingRequests.has(response.requestId)
        ) {
          const { resolve } = this.#pendingRequests.get(response.requestId)!
          this.#pendingRequests.delete(response.requestId)
          resolve(response as SelectedTextResult)
        } else {
          log.warn(
            '[SelectedTextService] Received response for unknown request:',
            response.requestId,
          )
        }
      } catch (error) {
        log.error(
          '[SelectedTextService] Error parsing response:',
          error,
          'Raw data:',
          line,
        )
      }
    }
  }

  #onStdErr(data: Buffer): void {
    log.error('[SelectedTextService] stderr:', data.toString())
  }

  #onClose(code: number, signal: string): void {
    log.warn(
      `[SelectedTextService] Process exited with code: ${code}, signal: ${signal}`,
    )
    this.#selectedTextProcess = null

    // Reject all pending requests
    this.#pendingRequests.forEach(({ reject }) => {
      reject(new Error(`Process exited with code ${code}`))
    })
    this.#pendingRequests.clear()

    this.emit('closed', { code, signal })
  }

  #onError(error: Error): void {
    log.error('[SelectedTextService] Process error:', error)
    this.emit('error', error)
  }

  public isRunning(): boolean {
    return this.#selectedTextProcess !== null
  }
}

// Export singleton instance
export const selectedTextReaderService = new SelectedTextReaderService()

export function getSelectedText(
  options: SelectedTextOptions = { format: 'json', maxLength: 10000 },
): Promise<SelectedTextResult> {
  return selectedTextReaderService.getSelectedText(options)
}

/**
 * Get selected text as plain string (convenience method)
 */
export async function getSelectedTextString(
  maxLength: number = 10000,
): Promise<string | null> {
  try {
    const result = await selectedTextReaderService.getSelectedText({
      format: 'json',
      maxLength,
    })
    return result.success ? result.text : null
  } catch (error) {
    log.error('Error getting selected text:', error)
    return null
  }
}

/**
 * Check if there is any selected text available
 */
export async function hasSelectedText(): Promise<boolean> {
  try {
    const result = await selectedTextReaderService.getSelectedText({
      format: 'json',
      maxLength: 1,
    })
    return result.success && result.length > 0
  } catch (error) {
    log.error('Error checking for selected text:', error)
    return false
  }
}
