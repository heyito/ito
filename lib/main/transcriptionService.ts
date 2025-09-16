import { grpcClient } from '../clients/grpcClient'
import log from 'electron-log'
import { ItoMode } from '@/app/generated/ito_pb'
import { BrowserWindow } from 'electron'
import { traceLogger } from './traceLogger'
import { AudioStreamManager } from './audio/AudioStreamManager'
import { InteractionManager } from './interactions/InteractionManager'
import { WindowMessenger } from './messaging/WindowMessenger'
import { TextInserter } from './text/TextInserter'
import { getCursorContext } from '../media/selected-text-reader'
import { grammarRulesService } from './grammar/GrammarRulesService'
import { v4 as uuidv4 } from 'uuid'

export class TranscriptionService {
  // Use the newer manager-based approach but with audio buffering
  private audioStreamManager = new AudioStreamManager()
  private interactionManager = new InteractionManager()
  private windowMessenger = new WindowMessenger()
  private textInserter = new TextInserter()

  // Audio buffering properties (from HEAD branch)
  private isStreaming = false
  private audioChunkQueue: Buffer[] = []
  private resolveNewChunk: ((value: void | PromiseLike<void>) => void) | null = null
  private currentInteractionId: string | null = null
  private audioChunksForInteraction: Buffer[] = []
  private interactionStartTime: number | null = null
  private currentSampleRate: number = 16000
  private readonly MINIMUM_AUDIO_DURATION_MS = 100
  private hasStartedGrpc = false
  private bufferedAudioBytes = 0
  private currentMode: ItoMode | null = null
  // 16-bit PCM mono -> 2 bytes per sample, write_audio_chunk in audio-recorder converts samples to 16-bit mono
  private bytesPerSample = 2

  public async startTranscription(mode: ItoMode) {
    // Guard against multiple concurrent transcriptions
    if (this.isStreaming) {
      log.warn('[TranscriptionService] Stream already in progress.')
      return
    }

    // Capture selected text and cursor context IMMEDIATELY when hotkey is pressed
    console.log('[TranscriptionService] Capturing context at hotkey press...')

    // Initialize both old and new systems
    this.isStreaming = true
    this.audioChunkQueue = []
    this.audioChunksForInteraction = []
    this.currentInteractionId = uuidv4()
    this.interactionStartTime = Date.now()
    this.hasStartedGrpc = false
    this.bufferedAudioBytes = 0
    this.currentMode = mode

    // Also initialize the manager-based system
    this.audioStreamManager.startStreaming()
    const interactionId = this.interactionManager.startInteraction()
    log.info('[TranscriptionService] Starting new transcription stream.')

    // Set global interaction ID for trace logging
    const globalInteractionId = (globalThis as any).currentInteractionId
    if (!globalInteractionId) {
      ;(globalThis as any).currentInteractionId = interactionId
    }

    // Log transcription start
    if (globalInteractionId || interactionId) {
      const logId = globalInteractionId || interactionId
      traceLogger.logStep(logId, 'TRANSCRIPTION_START', {
        localInteractionId: interactionId,
        startTime: this.interactionManager.getInteractionStartTime(),
      })
    }

    // Do not start gRPC yet; wait until enough audio has been buffered.
  }

  public stopStreaming() {
    if (!this.isStreaming) {
      return
    }
    this.isStreaming = false
    if (this.resolveNewChunk) {
      this.resolveNewChunk()
    }
    log.info('[TranscriptionService] Stream has been marked for closing.')

    // If gRPC never started, perform cleanup now
    if (!this.hasStartedGrpc) {
      const globalInteractionId = (globalThis as any).currentInteractionId
      if (globalInteractionId) {
        traceLogger.logStep(globalInteractionId, 'TRANSCRIPTION_TOO_SHORT', {
          localInteractionId: this.currentInteractionId,
          bufferedMs: this.getBufferedDurationMs(),
        })
        traceLogger.endInteraction(
          globalInteractionId,
          'TRANSCRIPTION_SKIPPED',
          {
            reason: 'insufficient_audio_duration',
            localInteractionId: this.currentInteractionId,
          },
        )
        ;(globalThis as any).currentInteractionId = null
      }

      this.resetState()
    }

    // Also stop the manager-based system
    this.audioStreamManager.stopStreaming()
    this.interactionManager.clearCurrentInteraction()
    ;(globalThis as any).currentInteractionId = null
  }

  public forwardAudioChunk(chunk: Buffer) {
    if (this.isStreaming) {
      this.audioChunkQueue.push(chunk)
      // Also store for interaction saving
      this.audioChunksForInteraction.push(chunk)
      this.bufferedAudioBytes += chunk.length

      // Also forward to the manager-based system
      this.audioStreamManager.addAudioChunk(chunk)

      if (this.resolveNewChunk) {
        this.resolveNewChunk()
        this.resolveNewChunk = null
      }

      // Start gRPC once we have buffered at least the minimum duration
      this.startGrpcIfReady()
    }

    // if not streaming, do nothing
  }

  private getBufferedDurationMs(): number {
    // 16-bit PCM mono -> 2 bytes per sample
    const totalSamples = this.bufferedAudioBytes / this.bytesPerSample
    const durationSeconds = totalSamples / (this.currentSampleRate || 16000)
    return Math.floor(durationSeconds * 1000)
  }

  private startGrpcIfReady() {
    if (
      this.hasStartedGrpc ||
      !this.isStreaming ||
      this.currentMode === null ||
      this.getBufferedDurationMs() < this.MINIMUM_AUDIO_DURATION_MS
    ) {
      return
    }

    this.hasStartedGrpc = true

    // Get current interaction ID for trace logging
    const globalInteractionId = (globalThis as any).currentInteractionId
    const interactionId = this.interactionManager.getCurrentInteractionId()

    grpcClient
      .transcribeStream(this.streamAudioChunks(), this.currentMode)
      .then(response => {
        this.handleTranscriptionResponse(
          response,
          globalInteractionId || interactionId,
        )
      })
      .catch(error => {
        this.handleTranscriptionError(
          error,
          globalInteractionId || interactionId,
        )
      })
      .finally(() => {
        // Ensure interaction is ended if it hasn't been ended yet
        const finalInteractionId = (globalThis as any).currentInteractionId
        if (finalInteractionId) {
          traceLogger.endInteraction(
            finalInteractionId,
            'TRANSCRIPTION_FINALLY',
            {
              localInteractionId: this.currentInteractionId,
              reason: 'finally_block',
            },
          )
          ;(globalThis as any).currentInteractionId = null
        }

        this.resetState()
        log.info('[TranscriptionService] Stream has fully terminated.')
      })
  }

  private async *streamAudioChunks(): AsyncIterable<Buffer> {
    while (this.isStreaming || this.audioChunkQueue.length > 0) {
      if (this.audioChunkQueue.length > 0) {
        yield this.audioChunkQueue.shift()!
      } else if (this.isStreaming) {
        // Wait for a new chunk to arrive
        await new Promise<void>(resolve => {
          this.resolveNewChunk = resolve
        })
      }
    }
  }

  private async handleTranscriptionResponse(
    response: any,
    interactionId: string,
  ) {
    // Add debugging to see what we received
    console.log('[TranscriptionService] Processing transcription response:', {
      transcript: response.transcript,
      transcriptLength: response.transcript?.length || 0,
      hasTranscript: !!response.transcript,
      hasError: !!response.error,
      errorCode: response.error?.code,
      errorType: response.error?.type,
      errorProvider: response.error?.provider,
      interactionId: this.interactionManager.getCurrentInteractionId(),
    })

    const errorMessage = response.error ? response.error.message : undefined

    // Handle any transcription error
    if (response.error) {
      if (response.error.code == 'CLIENT_AUDIO_TOO_SHORT') {
        if (interactionId) {
          traceLogger.logStep(interactionId, 'TRANSCRIPTION_TOO_SHORT', {
            transcript: response.transcript,
            transcriptLength: response.transcript?.length || 0,
            localInteractionId:
              this.interactionManager.getCurrentInteractionId(),
          })
        }
        log.info(
          '[TranscriptionService] Audio too short, restoring selected text.',
        )
      } else {
        log.error(
          '[TranscriptionService] Transcription error, restoring selected text:',
          response.error,
        )
      }

      // End the interaction after transcription error
      if (interactionId) {
        traceLogger.endInteraction(
          interactionId,
          'TRANSCRIPTION_FAILED',
          {
            error: response.error.message,
            localInteractionId: this.currentInteractionId,
          },
        )
        ;(globalThis as any).currentInteractionId = null
      }
    } else {
      if (interactionId) {
        traceLogger.logStep(interactionId, 'TRANSCRIPTION_SUCCESS', {
          transcript: response.transcript,
          transcriptLength: response.transcript?.length || 0,
          localInteractionId: this.interactionManager.getCurrentInteractionId(),
        })
      }

      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        const contextLength = 4 // Number of chars to consider for context
        const cursorContext = await getCursorContext(contextLength)

        // Apply grammar rules with cursor context
        const context = cursorContext || ''
        let correctedText = grammarRulesService.capitalizeFirstWordIfNeeded(
          context,
          response.transcript,
        )
        correctedText = grammarRulesService.addLeadingSpaceIfNeeded(
          context,
          correctedText,
        )

        await this.textInserter.insertText(correctedText, interactionId)

        // Create interaction in database
        await this.interactionManager.createInteraction(
          response.transcript,
          this.audioStreamManager.getInteractionAudioBuffer(),
          this.audioStreamManager.getCurrentSampleRate(),
          errorMessage,
        )
      }

      // Send transcription result to main window
      this.windowMessenger.sendTranscriptionResult(response)

      // End the interaction after successful transcription
      if (interactionId) {
        traceLogger.endInteraction(interactionId, 'TRANSCRIPTION_COMPLETED', {
          transcript: response.transcript,
          transcriptLength: response.transcript?.length || 0,
          localInteractionId: this.interactionManager.getCurrentInteractionId(),
        })
        ;(globalThis as any).currentInteractionId = null
      }
    }
  }

  private async handleTranscriptionError(error: any, interactionId: string) {
    log.error(
      '[TranscriptionService] An unexpected error occurred during transcription:',
      error,
    )

    // Send transcription error to main window
    this.windowMessenger.sendTranscriptionError(error)

    // Log transcription error
    if (interactionId) {
      traceLogger.logError(
        interactionId,
        'TRANSCRIPTION_ERROR',
        error.message,
        {
          localInteractionId: this.interactionManager.getCurrentInteractionId(),
          error: error.message,
        },
      )
    }

    // Clear current interaction on error
    this.interactionManager.clearCurrentInteraction()
    this.audioStreamManager.clearInteractionAudio()
    ;(globalThis as any).currentInteractionId = null
  }

  private resetState() {
    this.isStreaming = false
    this.currentInteractionId = null
    this.audioChunksForInteraction = []
    this.interactionStartTime = null
    this.hasStartedGrpc = false
    this.bufferedAudioBytes = 0
    this.currentMode = null
  }

  public stopTranscription() {
    this.stopStreaming()
    this.resetState()
  }

  public handleAudioChunk(chunk: Buffer) {
    return this.forwardAudioChunk(chunk)
  }

  public setAudioConfig(config: { sampleRate?: number; channels?: number }) {
    console.log('[TranscriptionService] Setting audio config:', config)
    this.audioStreamManager.setAudioConfig(config)
    if (config.sampleRate) {
      this.currentSampleRate = config.sampleRate
    }
  }

  public setMainWindow(mainWindow: BrowserWindow | null) {
    this.windowMessenger.setMainWindow(mainWindow)
  }
}

export const transcriptionService = new TranscriptionService()