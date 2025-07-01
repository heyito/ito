import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import os from 'os'
import log from 'electron-log'
import { getPillWindow, mainWindow } from '../main/app'
import { transcriptionService } from '../main/transcriptionService'
import { muteSystemAudio, unmuteSystemAudio } from './systemAudio'
import store from '../main/store'

// --- (No changes to the top part of the file) ---
export let audioRecorderProcess: ChildProcessWithoutNullStreams | null = null
let audioBuffer = Buffer.alloc(0)
let deviceListPromise: {
  resolve: (value: string[]) => void
  reject: (reason?: any) => void
} | null = null

let currentDeviceName: string | null = null

function getBinaryPath(): string | null {
  const isDev = !app.isPackaged
  const platform = os.platform()
  const binaryName =
    platform === 'win32' ? 'audio-recorder.exe' : 'audio-recorder'
  const baseDir = isDev
    ? join(__dirname, '../../native/audio-recorder/target')
    : join(process.resourcesPath, 'binaries')
  let archPath
  if (isDev) {
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
  } else {
    return join(process.resourcesPath, 'binaries', binaryName)
  }
  return join(baseDir, archPath, binaryName)
}

function calculateVolume(buffer: Buffer): number {
  if (buffer.length < 2) return 0
  let sumOfSquares = 0
  for (let i = 0; i < buffer.length - 1; i += 2) {
    const sample = buffer.readInt16LE(i)
    sumOfSquares += sample * sample
  }
  const rms = Math.sqrt(sumOfSquares / (buffer.length / 2))
  return Math.min(rms / 32767, 1.0)
}

const MSG_TYPE_JSON = 1
const MSG_TYPE_AUDIO = 2

function processData() {
  while (true) {
    if (audioBuffer.length < 5) break
    const msgType = audioBuffer.readUInt8(0)
    const msgLen = audioBuffer.readUInt32LE(1)
    const frameLen = 5 + msgLen
    if (audioBuffer.length < frameLen) break
    const payload = audioBuffer.slice(5, frameLen)
    audioBuffer = audioBuffer.slice(frameLen)

    if (msgType === MSG_TYPE_JSON) {
      const jsonResponse = JSON.parse(payload.toString('utf-8'))
      if (jsonResponse.type === 'device-list' && deviceListPromise) {
        deviceListPromise.resolve(jsonResponse.devices || [])
        deviceListPromise = null
      }
    } else if (msgType === MSG_TYPE_AUDIO) {
      // 1. Calculate volume for the UI pill
      const volume = calculateVolume(payload)
      getPillWindow()?.webContents.send('volume-update', volume)
      // 2. Forward the raw audio data to the transcription service
      transcriptionService.handleAudioChunk(payload)
    }
  }
}

// --- (No changes to startAudioRecorder, stopAudioRecorder, or sendCommand) ---

export function startAudioRecorder() {
  if (audioRecorderProcess) {
    log.warn('Audio recorder already running.')
    return
  }
  const binaryPath = getBinaryPath()
  if (!binaryPath) {
    log.error('Could not determine audio recorder binary path.')
    return
  }
  log.info(`Spawning audio recorder at: ${binaryPath}`)
  try {
    audioRecorderProcess = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    audioRecorderProcess.stdout.on('data', chunk => {
      audioBuffer = Buffer.concat([audioBuffer, chunk])
      processData()
    })
    audioRecorderProcess.stderr.on('data', data => {
      log.error('Audio recorder stderr:', data.toString())
    })
    audioRecorderProcess.on('close', code => {
      log.warn(`Audio recorder process exited with code: ${code}`)
      audioRecorderProcess = null
    })
    audioRecorderProcess.on('error', err => {
      log.error('Failed to start audio recorder:', err)
      audioRecorderProcess = null
    })
  } catch (err) {
    log.error('Caught an error while spawning audio recorder:', err)
  }
}

export function stopAudioRecorder() {
  if (audioRecorderProcess) {
    log.info('Stopping audio recorder process.')
    audioRecorderProcess.kill()
    audioRecorderProcess = null
  }
}

function sendCommand(command: object) {
  if (audioRecorderProcess && audioRecorderProcess.stdin) {
    const cmdString = JSON.stringify(command) + '\n'
    audioRecorderProcess.stdin.write(cmdString)
  } else {
    log.warn(
      'Attempted to send command, but audio recorder is not running or stdin is not available.',
    )
  }
}

export const sendStartRecordingCommand = (deviceName: string) => {
  sendCommand({ command: 'start', device_name: deviceName })
  transcriptionService.startTranscription() // Start the gRPC stream

  // Check if audio muting is enabled and mute system audio
  const settings = store.get('settings')
  if (settings && settings.muteAudioWhenDictating) {
    log.info('[Audio] Muting system audio for dictation')
    muteSystemAudio()
  }

  currentDeviceName = deviceName
  log.info(`[Audio] Recording started on device: ${currentDeviceName}`)
}

export const sendStopRecordingCommand = () => {
  sendCommand({ command: 'stop' })
  transcriptionService.stopTranscription() // Stop the gRPC stream

  // Check if audio muting is enabled and unmute system audio
  const settings = store.get('settings')
  if (settings && settings.muteAudioWhenDictating) {
    log.info('[Audio] Unmuting system audio after dictation')
    unmuteSystemAudio()
  }

  currentDeviceName = null
  log.info('[Audio] Recording stopped')
}

export function handleAudioDeviceChange() {
  // Notify the renderer windows to refresh their device lists in the UI.
  // You can use this event in your UI components to re-fetch the microphone list.
  mainWindow?.webContents.send('force-device-list-reload')
  getPillWindow()?.webContents.send('force-device-list-reload')
}

export function requestDeviceListPromise(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!audioRecorderProcess) {
      return reject(new Error('Audio recorder process not running.'))
    }
    deviceListPromise = { resolve, reject }
    sendCommand({ command: 'list-devices' })
  })
}
