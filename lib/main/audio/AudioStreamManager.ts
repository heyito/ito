import { AudioChunkSchema } from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'

export class AudioStreamManager {
  private isStreaming = false
  private audioChunkQueue: Buffer[] = []
  private resolveNewChunk: ((value: void | PromiseLike<void>) => void) | null =
    null
  private audioChunksForInteraction: Buffer[] = []
  private currentSampleRate: number = 16000
  private readonly MINIMUM_AUDIO_DURATION_MS = 100
  private hasStartedStreaming = false
  private bufferedAudioBytes = 0
  // 16-bit PCM mono -> 2 bytes per sample
  private bytesPerSample = 2

  async *streamAudioChunks() {
    // Wait until we have enough buffered audio before starting to stream
    while (this.isStreaming && !this.hasStartedStreaming) {
      if (this.getBufferedDurationMs() >= this.MINIMUM_AUDIO_DURATION_MS) {
        this.hasStartedStreaming = true
        break
      }
      await new Promise<void>(resolve => {
        this.resolveNewChunk = resolve
      })
    }

    // Now stream the audio chunks
    while (this.isStreaming || this.audioChunkQueue.length > 0) {
      if (this.audioChunkQueue.length === 0) {
        if (this.isStreaming) {
          await new Promise<void>(resolve => {
            this.resolveNewChunk = resolve
          })
        } else {
          break
        }
      }

      while (this.audioChunkQueue.length > 0) {
        const chunk = this.audioChunkQueue.shift()
        if (chunk) {
          yield create(AudioChunkSchema, { audioData: chunk })
        }
      }
    }
  }

  startStreaming() {
    this.isStreaming = true
    this.audioChunkQueue = []
    this.audioChunksForInteraction = []
    this.hasStartedStreaming = false
    this.bufferedAudioBytes = 0
  }

  stopStreaming() {
    this.isStreaming = false
    if (this.resolveNewChunk) {
      this.resolveNewChunk()
      this.resolveNewChunk = null
    }
  }

  addAudioChunk(chunk: Buffer) {
    if (!this.isStreaming) {
      return
    }

    this.audioChunkQueue.push(chunk)
    this.audioChunksForInteraction.push(chunk)
    this.bufferedAudioBytes += chunk.length

    if (this.resolveNewChunk) {
      this.resolveNewChunk()
      this.resolveNewChunk = null
    }
  }

  getInteractionAudioBuffer(): Buffer {
    return Buffer.concat(this.audioChunksForInteraction)
  }

  setAudioConfig(config: { sampleRate?: number; channels?: number }) {
    if (typeof config.sampleRate === 'number' && config.sampleRate > 0) {
      this.currentSampleRate = config.sampleRate
    }
  }

  getCurrentSampleRate(): number {
    return this.currentSampleRate
  }

  isCurrentlyStreaming(): boolean {
    return this.isStreaming
  }

  clearInteractionAudio() {
    this.audioChunksForInteraction = []
  }

  getBufferedDurationMs(): number {
    // 16-bit PCM mono -> 2 bytes per sample
    const totalSamples = this.bufferedAudioBytes / this.bytesPerSample
    const durationSeconds = totalSamples / this.currentSampleRate
    return Math.floor(durationSeconds * 1000)
  }

  hasMinimumDuration(): boolean {
    return this.getBufferedDurationMs() >= this.MINIMUM_AUDIO_DURATION_MS
  }
}
