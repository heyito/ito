import { grpcClient } from '../clients/grpcClient'
import mainStore from './store'
import { STORE_KEYS } from '../constants/store-keys'
import log from 'electron-log'
import { AudioChunkSchema } from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'
import { InteractionsTable } from './sqlite/repo'
import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'

export class TranscriptionService {
  private isStreaming = false
  private audioChunkQueue: Buffer[] = []
  private resolveNewChunk: ((value: void | PromiseLike<void>) => void) | null =
    null
  private currentInteractionId: string | null = null
  private audioChunksForInteraction: Buffer[] = []
  private interactionStartTime: number | null = null

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
    if (this.isStreaming) {
      log.warn('[TranscriptionService] Stream already in progress.')
      return
    }

    this.isStreaming = true
    this.audioChunkQueue = []
    this.audioChunksForInteraction = []
    this.currentInteractionId = uuidv4()
    this.interactionStartTime = Date.now() // Record start time
    log.info('[gRPC Service] Starting new transcription stream.')

    grpcClient
      .transcribeStream(this.streamAudioChunks())
      .then(response => {
        // Add debugging to see what we received
        console.log(
          '[TranscriptionService] Processing transcription response:',
          {
            transcript: response.transcript,
            transcriptLength: response.transcript?.length || 0,
            hasTranscript: !!response.transcript,
            hasError: !!response.error,
            errorCode: response.error?.code,
            errorType: response.error?.type,
            errorProvider: response.error?.provider,
            interactionId: this.currentInteractionId,
          },
        )

        const errorMessage = response.error ? response.error.message : undefined
        if (response.error && response.error.code == 'CLIENT_AUDIO_TOO_SHORT') {
          log.info(
            '[TranscriptionService] Audio too short, skipping interaction.',
          )
        } else {
          this.createInteraction(response.transcript, errorMessage)
        }
      })
      .catch(error => {
        log.error(
          '[TranscriptionService] An unexpected error occurred during transcription:',
          error,
        )
        // Still create interaction even if transcription failed
        this.createInteraction('', error.message)
      })
      .finally(() => {
        this.isStreaming = false
        this.currentInteractionId = null
        this.audioChunksForInteraction = []
        this.interactionStartTime = null // Reset timing
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
      // Also store for interaction saving
      this.audioChunksForInteraction.push(chunk)

      if (this.resolveNewChunk) {
        this.resolveNewChunk()
        this.resolveNewChunk = null
      }
    }

    // if not streaming, do nothing
  }

  private async createInteraction(transcript: string, errorMessage?: string) {
    try {
      // Save to database
      const userProfile = mainStore.get(STORE_KEYS.USER_PROFILE) as any
      const userId = userProfile?.id

      if (!userId) {
        log.warn(
          '[TranscriptionService] No user ID found, skipping interaction save.',
        )
        return
      }

      if (!this.currentInteractionId) {
        log.warn(
          '[TranscriptionService] No current interaction ID, skipping interaction save.',
        )
        return
      }

      // Calculate interaction duration
      const interactionEndTime = Date.now()
      const durationMs = this.interactionStartTime
        ? interactionEndTime - this.interactionStartTime
        : 0

      // Create ASR output object
      const asrOutput = {
        transcript,
        audioChunkCount: this.audioChunksForInteraction.length,
        totalAudioBytes: this.audioChunksForInteraction.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        ),
        error: errorMessage || null,
        timestamp: new Date().toISOString(),
        durationMs, // Add duration to ASR output for backwards compatibility
      }

      // Concatenate all audio chunks into a single buffer
      const rawAudio =
        this.audioChunksForInteraction.length > 0
          ? Buffer.concat(this.audioChunksForInteraction)
          : null

      // Generate a meaningful title from the transcript
      const title =
        transcript.length > 50
          ? transcript.substring(0, 50) + '...'
          : transcript || 'Voice interaction'

      // Create interaction locally using upsert to specify our own ID
      const now = new Date().toISOString()
      await InteractionsTable.upsert({
        id: this.currentInteractionId,
        user_id: userId,
        title,
        asr_output: asrOutput,
        llm_output: null, // No LLM processing yet
        raw_audio: rawAudio,
        duration_ms: durationMs, // Add duration as separate field
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })

      log.info(
        `[TranscriptionService] Created interaction: ${this.currentInteractionId} (duration: ${durationMs}ms)`,
      )
      console.log(
        '[TranscriptionService] Successfully saved interaction to database',
      )

      // Notify all windows about the new interaction
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('interaction-created', {
          id: this.currentInteractionId,
          transcript,
          timestamp: new Date().toISOString(),
          durationMs,
        })
      })
    } catch (error) {
      log.error('[TranscriptionService] Failed to create interaction:', error)
      console.error('[TranscriptionService] Database save error:', error)
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
