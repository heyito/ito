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

export interface CursorContextResult {
  success: boolean
  contextText: string | null
  error: string | null
  length: number
}

interface CursorContextCommand {
  command: 'get-cursor-context'
  cutCurrentSelection?: boolean // Whether to cut current selection to position cursor correctly
  contextLength?: number
  requestId: string
}

const nativeModuleName = 'selected-text-reader'
const MAXIUMUM_TEXT_LENGTH_DEFAULT = 10000 // Maximum length of text to return

type PendingRequest = {
  resolve: (value: any) => void
  reject: (reason?: any) => void
}

class SelectedTextReaderService extends EventEmitter {
  #selectedTextProcess: ReturnType<typeof spawn> | null = null
  #pendingRequests = new Map<string, PendingRequest>()
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

    console.log(
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

      console.log('[SelectedTextService] Selected text reader process started.')
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
      console.log(
        '[SelectedTextService] Stopping selected text reader process.',
      )
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
    options: SelectedTextOptions = {
      format: 'json',
      maxLength: MAXIUMUM_TEXT_LENGTH_DEFAULT,
    },
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
        maxLength: options.maxLength || MAXIUMUM_TEXT_LENGTH_DEFAULT,
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

  /**
   * Sends a command to get cursor context.
   */
  public async getCursorContext(
    contextLength: number,
    cutCurrentSelection: boolean = false,
  ): Promise<CursorContextResult> {
    if (!this.#selectedTextProcess) {
      throw new Error('Selected text reader process not running')
    }

    return new Promise((resolve, reject) => {
      const requestId = `ctx_${++this.#requestIdCounter}_${Date.now()}`
      this.#pendingRequests.set(requestId, { resolve, reject })

      const command: CursorContextCommand = {
        command: 'get-cursor-context',
        contextLength: contextLength,
        cutCurrentSelection,
        requestId,
      }

      this.#sendCommand(command)

      // Set timeout to avoid hanging requests
      setTimeout(() => {
        if (this.#pendingRequests.has(requestId)) {
          this.#pendingRequests.delete(requestId)
          reject(new Error('Cursor context request timed out'))
        }
      }, 5000) // 5 second timeout
    })
  }

  #sendCommand(command: SelectedTextCommand | CursorContextCommand): void {
    if (!this.#selectedTextProcess) {
      log.error(
        '[SelectedTextService] Cannot send command, process not running',
      )
      return
    }

    try {
      const commandStr = JSON.stringify(command) + '\n'
      this.#selectedTextProcess.stdin?.write(commandStr)
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
          resolve(response)
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
  options: SelectedTextOptions = {
    format: 'json',
    maxLength: MAXIUMUM_TEXT_LENGTH_DEFAULT,
  },
): Promise<SelectedTextResult> {
  return selectedTextReaderService.getSelectedText(options)
}

/**
 * Get selected text as plain string (convenience method)
 */
export async function getSelectedTextString(
  maxLength: number = MAXIUMUM_TEXT_LENGTH_DEFAULT,
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

/**
 * Get cursor context using the new getCursorContext functionality
 */
export async function getCursorContext(contextLength: number): Promise<string> {
  const cursorContextResult = await selectedTextReaderService.getCursorContext(
    contextLength,
    false,
  )
  const preCursorText = cursorContextResult.contextText || ''

  return preCursorText
}
