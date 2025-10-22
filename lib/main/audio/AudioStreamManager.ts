import { AudioChunkSchema } from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'

export class AudioStreamManager {
  private isStreaming = false
  private audioChunkQueue: Buffer[] = []
  private resolveNewChunk: ((value: void | PromiseLike<void>) => void) | null =
    null
  private audioChunksForInteraction: Buffer[] = []
  private currentSampleRate: number = 16000

  async *streamAudioChunks() {
    // Stream audio chunks as they arrive
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

  initialize() {
    this.isStreaming = true
    this.audioChunkQueue = []
    this.audioChunksForInteraction = []
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

  getAudioDurationMs(): number {
    const totalBytes = this.audioChunksForInteraction.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    )
    // 16-bit PCM mono -> 2 bytes per sample
    const totalSamples = totalBytes / 2
    const durationSeconds = totalSamples / this.currentSampleRate
    return Math.floor(durationSeconds * 1000)
  }
}
