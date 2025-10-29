import { enhancePcm16 } from './audio.js'
import { createWavHeader } from '../services/ito/audioUtils.js'

/**
 * Concatenates multiple audio chunks into a single Uint8Array.
 *
 * @param audioChunks - Array of audio chunks to concatenate
 * @returns A single Uint8Array containing all concatenated audio data
 */
export function concatenateAudioChunks(audioChunks: Uint8Array[]): Uint8Array {
  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const fullAudio = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of audioChunks) {
    fullAudio.set(chunk, offset)
    offset += chunk.length
  }

  console.log(
    `🔧 [${new Date().toISOString()}] Concatenated audio: ${totalLength} bytes`,
  )

  return fullAudio
}

/**
 * Prepares raw PCM audio data for transcription by enhancing it and adding a WAV header.
 *
 * Audio specifications:
 * - Sample rate: 16000 Hz
 * - Bit depth: 16 bits
 * - Channels: 1 (mono)
 *
 * @param audioData - Raw PCM audio data
 * @returns Buffer containing WAV-formatted audio ready for transcription
 */
export function prepareAudioForTranscription(audioData: Uint8Array): Buffer {
  const sampleRate = 16000
  const bitDepth = 16
  const channels = 1

  const enhancedPcm = enhancePcm16(Buffer.from(audioData), sampleRate)
  const wavHeader = createWavHeader(
    enhancedPcm.length,
    sampleRate,
    channels,
    bitDepth,
  )

  return Buffer.concat([wavHeader, enhancedPcm])
}
