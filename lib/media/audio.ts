import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import os from 'os'
import log from 'electron-log'
import { EventEmitter } from 'events'
import { traceLogger } from '../main/traceLogger'

// Message types from the native binary
const MSG_TYPE_JSON = 1
const MSG_TYPE_AUDIO = 2

interface Message {
  type: 'json' | 'audio'
  payload: Buffer
}

class AudioRecorderService extends EventEmitter {
  #audioRecorderProcess: ChildProcessWithoutNullStreams | null = null
  #audioBuffer = Buffer.alloc(0)
  #deviceListPromise: {
    resolve: (value: string[]) => void
    reject: (reason?: any) => void
  } | null = null

  constructor() {
    super()
  }

  /**
   * Spawns and initializes the native audio-recorder process.
   */
  public initialize(): void {
    if (this.#audioRecorderProcess) {
      log.warn('[AudioService] Audio recorder already running.')
      return
    }

    const binaryPath = this.#getBinaryPath()
    if (!binaryPath) {
      log.error(
        '[AudioService] Could not determine audio recorder binary path.',
      )
      // Optionally emit an error event
      this.emit('error', new Error('Audio recorder binary not found.'))
      return
    }

    log.info(`[AudioService] Spawning audio recorder at: ${binaryPath}`)
    try {
      this.#audioRecorderProcess = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      this.#audioRecorderProcess.stdout.on('data', this.#onData.bind(this))
      this.#audioRecorderProcess.stderr.on('data', this.#onStdErr.bind(this))
      this.#audioRecorderProcess.on('close', this.#onClose.bind(this))
      this.#audioRecorderProcess.on('error', this.#onError.bind(this))

      this.emit('started')
    } catch (err) {
      log.error(
        '[AudioService] Caught an error while spawning audio recorder:',
        err,
      )
      this.#audioRecorderProcess = null
      this.emit('error', err)
    }
  }

  /**
   * Stops the native audio-recorder process.
   */
  public terminate(): void {
    if (this.#audioRecorderProcess) {
      log.info('[AudioService] Stopping audio recorder process.')
      this.#audioRecorderProcess.kill()
      this.#audioRecorderProcess = null
      this.emit('stopped')
    }
  }

  /**
   * Sends a command to start recording from a specific device.
   */
  public startRecording(deviceName: string): void {
    // Get current interaction ID for trace logging
    const interactionId = (globalThis as any).currentInteractionId
    if (interactionId) {
      traceLogger.logStep(interactionId, 'AUDIO_RECORDING_START', {
        deviceName,
        hasProcess: !!this.#audioRecorderProcess,
      })
    }

    this.#sendCommand({ command: 'start', device_name: deviceName })
    log.info(`[AudioService] Recording started on device: ${deviceName}`)
  }

  /**
   * Sends a command to stop the current recording.
   */
  public stopRecording(): void {
    // Get current interaction ID for trace logging
    const interactionId = (globalThis as any).currentInteractionId
    if (interactionId) {
      traceLogger.logStep(interactionId, 'AUDIO_RECORDING_STOP', {
        hasProcess: !!this.#audioRecorderProcess,
      })
    }

    this.#sendCommand({ command: 'stop' })
    log.info('[AudioService] Recording stopped')
  }

  /**
   * Requests a list of available audio devices from the native process.
   */
  public getDeviceList(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.#audioRecorderProcess) {
        return reject(new Error('Audio recorder process not running.'))
      }
      this.#deviceListPromise = { resolve, reject }
      this.#sendCommand({ command: 'list-devices' })
    })
  }

  // --- Private Methods ---

  /**
   * Handles incoming data chunks from the process's stdout.
   */
  #onData(chunk: Buffer): void {
    this.#audioBuffer = Buffer.concat([this.#audioBuffer, chunk])
    this.#processData()
  }

  #onStdErr(data: Buffer): void {
    log.error('[AudioService] stderr:', data.toString())
  }

  #onClose(code: number | null): void {
    log.warn(`[AudioService] Process exited with code: ${code}`)
    this.#audioRecorderProcess = null
    this.emit('stopped')
  }

  #onError(err: Error): void {
    log.error('[AudioService] Failed to start audio recorder:', err)
    this.#audioRecorderProcess = null
    this.emit('error', err)
  }

  /**
   * Parses the internal buffer for complete messages and processes them.
   * This function is now cleaner, acting as a loop that calls helper methods.
   */
  #processData(): void {
    while (true) {
      const message = this.#parseMessage()
      if (!message) {
        break // Not enough data for a full message, wait for more.
      }
      this.#handleMessage(message)
    }
  }

  /**
   * Tries to parse a single message from the buffer.
   * If a full message is available, it returns the message and slices the buffer.
   * Otherwise, it returns null.
   */
  #parseMessage(): Message | null {
    if (this.#audioBuffer.length < 5) return null // 1 byte type + 4 bytes length

    const msgType = this.#audioBuffer.readUInt8(0)
    const msgLen = this.#audioBuffer.readUInt32LE(1)
    const frameLen = 5 + msgLen

    if (this.#audioBuffer.length < frameLen) return null // Incomplete frame

    const payload = this.#audioBuffer.slice(5, frameLen)
    this.#audioBuffer = this.#audioBuffer.slice(frameLen) // Consume the message from the buffer

    switch (msgType) {
      case MSG_TYPE_JSON:
        return { type: 'json', payload }
      case MSG_TYPE_AUDIO:
        return { type: 'audio', payload }
      default:
        log.warn(`[AudioService] Unknown message type: ${msgType}`)
        return null // Or handle error appropriately
    }
  }

  /**
   * Handles a parsed message by emitting corresponding events.
   * This completely removes side effects from the data processing logic.
   */
  #handleMessage(message: Message): void {
    if (message.type === 'json') {
      try {
        const jsonResponse = JSON.parse(message.payload.toString('utf-8'))
        if (jsonResponse.type === 'device-list' && this.#deviceListPromise) {
          this.#deviceListPromise.resolve(jsonResponse.devices || [])
          this.#deviceListPromise = null
        }
        // You could emit a generic 'json-message' event here if needed
      } catch (err) {
        log.error('[AudioService] Failed to parse JSON response:', err)
        // Optionally reject pending device list promise if parsing fails
        if (this.#deviceListPromise) {
          this.#deviceListPromise.reject(
            new Error('Failed to parse JSON response'),
          )
          this.#deviceListPromise = null
        }
      }
    } else if (message.type === 'audio') {
      const volume = this.#calculateVolume(message.payload)
      this.emit('volume-update', volume)
      this.emit('audio-chunk', message.payload)
    }
  }

  #sendCommand(command: object): void {
    if (this.#audioRecorderProcess?.stdin) {
      const cmdString = JSON.stringify(command) + '\n'
      this.#audioRecorderProcess.stdin.write(cmdString)
    } else {
      log.warn('[AudioService] Cannot send command, process not running.')
    }
  }

  #calculateVolume(buffer: Buffer): number {
    if (buffer.length < 2) return 0
    let sumOfSquares = 0
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const sample = buffer.readInt16LE(i)
      sumOfSquares += sample * sample
    }
    const rms = Math.sqrt(sumOfSquares / (buffer.length / 2))
    return Math.min(rms / 32767, 1.0)
  }

  #getBinaryPath(): string | null {
    const isDev = !app.isPackaged
    const platform = os.platform()
    const binaryName =
      platform === 'win32' ? 'audio-recorder.exe' : 'audio-recorder'
    const baseDir = isDev
      ? join(__dirname, '../../native/audio-recorder/target')
      : join(process.resourcesPath, 'binaries')

    if (isDev) {
      let archPath
      if (platform === 'darwin') {
        archPath = 'universal'
      } else if (platform === 'win32') {
        archPath = 'x86_64-pc-windows-gnu/release'
      } else {
        log.error(
          `Unsupported development platform for audio-recorder: ${platform}`,
        )
        return null
      }
      return join(baseDir, archPath, binaryName)
    } else {
      return join(process.resourcesPath, 'binaries', binaryName)
    }
  }
}

// Export a singleton instance of the service
export const audioRecorderService = new AudioRecorderService()
