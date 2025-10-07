import { AudioChunkSchema } from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'

export class AudioStreamManager {
  private isStreaming = false
  private audioChunkQueue: Buffer[] = []
  private resolveNewChunk: ((value: void | PromiseLike<void>) => void) | null =
    null
  private audioChunksForInteraction: Buffer[] = []
  private currentSampleRate: number = 16000
  private bufferedAudioBytes = 0
  // 16-bit PCM mono -> 2 bytes per sample
  private bytesPerSample = 2

  async *streamAudioChunks() {
    // Stream audio chunks immediately without delay
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

  calculateAudioEnergy(): number {
    const buffer = this.getInteractionAudioBuffer()
    if (buffer.length < 2) return 0

    let sumOfSquares = 0
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const sample = buffer.readInt16LE(i)
      sumOfSquares += sample * sample
    }
    const rms = Math.sqrt(sumOfSquares / (buffer.length / 2))
    // Normalize to 0-1 range (32767 is max for 16-bit signed PCM)
    return rms / 32767
  }

  hasMinimumEnergy(threshold: number = 0.002): boolean {
    return this.calculateAudioEnergy() >= threshold
  }
}
