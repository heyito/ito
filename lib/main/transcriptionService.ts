import { grpcClient } from '../clients/grpcClient'
import mainStore from './store'
import log from 'electron-log'
import { AudioChunkSchema } from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'

export class TranscriptionService {
  private isStreaming = false
  private audioChunkQueue: Buffer[] = []
  private resolveNewChunk: ((value: void | PromiseLike<void>) => void) | null =
    null

  private async *streamAudioChunks() {
    while (this.isStreaming) {
      if (this.audioChunkQueue.length === 0) {
        await new Promise<void>(resolve => {
          this.resolveNewChunk = resolve
        })
      }

      while (this.audioChunkQueue.length > 0) {
        const chunk = this.audioChunkQueue.shift()
        if (chunk) {
          yield create(AudioChunkSchema, { audioData: chunk })
        }
      }
    }
  }

  public startStreaming() {
    const accessToken = mainStore.get('accessToken')
    if (!accessToken) {
      log.warn(
        '[TranscriptionService] No access token found. Skipping stream start.',
      )
      return
    }

    if (this.isStreaming) {
      log.warn('[TranscriptionService] Stream already in progress.')
      return
    }

    this.isStreaming = true
    this.audioChunkQueue = []
    log.info('[gRPC Service] Starting new transcription stream.')

    grpcClient
      .transcribeStream(this.streamAudioChunks())
      .catch(error => {
        log.error(
          '[gRPC Service] An unexpected error occurred during transcription:',
          error,
        )
      })
      .finally(() => {
        this.isStreaming = false
        log.info('[gRPC Service] Stream has fully terminated.')
      })
  }

  public stopStreaming() {
    if (!this.isStreaming) {
      return
    }
    this.isStreaming = false
    if (this.resolveNewChunk) {
      this.resolveNewChunk()
    }
    log.info('[gRPC Service] Stream has been marked for closing.')
  }

  public forwardAudioChunk(chunk: Buffer) {
    if (this.isStreaming) {
      this.audioChunkQueue.push(chunk)
      if (this.resolveNewChunk) {
        this.resolveNewChunk()
        this.resolveNewChunk = null
      }
    }
  }

  // Backward compatibility aliases for the old method names
  public startTranscription() {
    return this.startStreaming()
  }

  public stopTranscription() {
    return this.stopStreaming()
  }

  public handleAudioChunk(chunk: Buffer) {
    return this.forwardAudioChunk(chunk)
  }
}

export const transcriptionService = new TranscriptionService()
