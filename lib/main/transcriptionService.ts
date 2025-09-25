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
import { canGetContextFromCurrentApp } from '../utils/applicationDetection'
import { grammarRulesService } from './grammar/GrammarRulesService'

export class TranscriptionService {
  private audioStreamManager = new AudioStreamManager()
  private interactionManager = new InteractionManager()
  private windowMessenger = new WindowMessenger()
  private textInserter = new TextInserter()
  private isFinalizing: boolean = false
  private hasStartedGrpc = false
  private currentMode: ItoMode | null = null
  private interactionId: string | null = null

  public async startTranscription(mode: ItoMode): Promise<boolean> {
    // Guard against multiple concurrent transcriptions
    if (this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[TranscriptionService] Stream already in progress.')
      return false
    }
    // Guard while we are finalizing the previous interaction (creating DB rows, inserting text)
    if (this.isFinalizing) {
      log.warn(
        '[TranscriptionService] Finalizing previous interaction, ignoring new start.',
      )
      return false
    }

    this.audioStreamManager.startStreaming()
    this.hasStartedGrpc = false
    this.currentMode = mode
    log.info('[TranscriptionService] Starting new transcription stream.')

    // Reuse existing global interaction ID if present, otherwise create a new one
    const existingId = (globalThis as any).currentInteractionId as string | null
    if (existingId) {
      this.interactionManager.adoptInteractionId(existingId)
      this.interactionId = existingId
    } else {
      this.interactionId = this.interactionManager.startInteraction()
      ;(globalThis as any).currentInteractionId = this.interactionId
    }
    log.info('[TranscriptionService] Starting new transcription stream.')

    // Log transcription start
    traceLogger.logStep(this.interactionId, 'TRANSCRIPTION_START', {
      localInteractionId: this.interactionId,
      startTime: this.interactionManager.getInteractionStartTime(),
    })

    return true
  }

  public stopStreaming() {
    // If we never started gRPC due to insufficient audio, handle cleanup
    if (!this.hasStartedGrpc) {
      const globalInteractionId = (globalThis as any).currentInteractionId
      const interactionId = this.interactionManager.getCurrentInteractionId()

      if (globalInteractionId || interactionId) {
        const logId = globalInteractionId || interactionId
        traceLogger.logStep(logId, 'TRANSCRIPTION_TOO_SHORT', {
          localInteractionId: interactionId,
          bufferedMs: this.audioStreamManager.getBufferedDurationMs(),
        })
        traceLogger.endInteraction(logId, 'TRANSCRIPTION_SKIPPED', {
          reason: 'insufficient_audio_duration',
          localInteractionId: interactionId,
        })
        ;(globalThis as any).currentInteractionId = null
      }

      this.interactionManager.clearCurrentInteraction()
    }

    this.audioStreamManager.stopStreaming()
  }

  public forwardAudioChunk(chunk: Buffer) {
    this.audioStreamManager.addAudioChunk(chunk)
    this.startGrpcIfReady()
  }

  private startGrpcIfReady() {
    if (
      this.hasStartedGrpc ||
      !this.audioStreamManager.isCurrentlyStreaming() ||
      !this.audioStreamManager.hasMinimumDuration() ||
      this.currentMode === null
    ) {
      return
    }

    this.hasStartedGrpc = true

    grpcClient
      .transcribeStream(
        this.audioStreamManager.streamAudioChunks(),
        this.currentMode,
      )
      .then(response => {
        this.handleTranscriptionResponse(response)
      })
      .catch(error => {
        this.handleTranscriptionError(error)
      })
  }

  private async handleTranscriptionResponse(response: any) {
    // Prevent new streams while we finalize
    this.isFinalizing = true
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
        if (this.interactionId) {
          traceLogger.logStep(this.interactionId, 'TRANSCRIPTION_TOO_SHORT', {
            transcript: response.transcript,
            transcriptLength: response.transcript?.length || 0,
            localInteractionId:
              this.interactionManager.getCurrentInteractionId(),
          })
        }
      }

      // Save failed interaction to database
      await this.interactionManager.createInteraction(
        response.transcript || '',
        this.audioStreamManager.getInteractionAudioBuffer(),
        this.audioStreamManager.getCurrentSampleRate(),
        errorMessage,
      )

      // End the interaction after transcription error
      if (this.interactionId) {
        traceLogger.endInteraction(this.interactionId, 'TRANSCRIPTION_FAILED', {
          error: response.error.message,
          localInteractionId: this.interactionManager.getCurrentInteractionId(),
        })
        ;(globalThis as any).currentInteractionId = null
      }

      this.audioStreamManager.clearInteractionAudio()
      this.interactionManager.clearCurrentInteraction()
      this.isFinalizing = false
    } else {
      if (this.interactionId) {
        traceLogger.logStep(this.interactionId, 'TRANSCRIPTION_SUCCESS', {
          transcript: response.transcript,
          transcriptLength: response.transcript?.length || 0,
          localInteractionId: this.interactionManager.getCurrentInteractionId(),
        })
      }

      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        const contextLength = 4 // Number of chars to consider for context
        const canGetContext = await canGetContextFromCurrentApp()
        let cursorContext
        try {
          cursorContext = canGetContext
            ? await getCursorContext(contextLength)
            : ''
        } catch (e) {
          console.error('Cursor context failed:', e)
        }

        // Apply grammar rules with cursor context
        const context = cursorContext || ''
        let correctedText = grammarRulesService.setCaseFirstWord(
          context,
          response.transcript,
        )
        correctedText = grammarRulesService.addLeadingSpaceIfNeeded(
          context,
          correctedText,
        )

        await this.textInserter.insertText(correctedText, this.interactionId)

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
      if (this.interactionId) {
        traceLogger.endInteraction(
          this.interactionId,
          'TRANSCRIPTION_COMPLETED',
          {
            transcript: response.transcript,
            transcriptLength: response.transcript?.length || 0,
            localInteractionId:
              this.interactionManager.getCurrentInteractionId(),
          },
        )
        ;(globalThis as any).currentInteractionId = null
      }

      this.audioStreamManager.clearInteractionAudio()
      this.interactionManager.clearCurrentInteraction()
      this.isFinalizing = false
    }
  }

  private async handleTranscriptionError(error: any) {
    log.error(
      '[TranscriptionService] An unexpected error occurred during transcription:',
      error,
    )

    // Send transcription error to main window
    this.windowMessenger.sendTranscriptionError(error)

    // Log transcription error
    if (this.interactionId) {
      traceLogger.logError(
        this.interactionId,
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
    this.isFinalizing = false
  }

  public stopTranscription() {
    // Mark as finalizing to ignore accidental restarts during paste/DB save
    this.isFinalizing = true
    this.audioStreamManager.stopStreaming()

    // Fallback: if no streaming is active and no handler will reset the flag,
    // clear the interaction and allow future starts after a short delay.
    setTimeout(() => {
      if (!this.audioStreamManager.isCurrentlyStreaming()) {
        // If the interaction manager doesn't hold an interaction, clear global and unlock
        const currentId = this.interactionManager.getCurrentInteractionId()
        if (!currentId) {
          ;(globalThis as any).currentInteractionId = null
        }
        this.isFinalizing = false
      }
    }, 750)
  }

  public handleAudioChunk(chunk: Buffer) {
    return this.forwardAudioChunk(chunk)
  }

  public setAudioConfig(config: { sampleRate?: number; channels?: number }) {
    console.log('[TranscriptionService] Setting audio config:', config)
    this.audioStreamManager.setAudioConfig(config)
  }

  public setMainWindow(mainWindow: BrowserWindow | null) {
    this.windowMessenger.setMainWindow(mainWindow)
  }
}

export const transcriptionService = new TranscriptionService()
