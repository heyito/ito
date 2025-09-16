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

export class TranscriptionService {
  private audioStreamManager = new AudioStreamManager()
  private interactionManager = new InteractionManager()
  private windowMessenger = new WindowMessenger()
  private textInserter = new TextInserter()

  public async startTranscription(mode: ItoMode) {
    // Guard against multiple concurrent transcriptions
    if (this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[TranscriptionService] Stream already in progress.')
      return
    }

    // Capture selected text and cursor context IMMEDIATELY when hotkey is pressed
    console.log('[TranscriptionService] Capturing context at hotkey press...')

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

    grpcClient
      .transcribeStream(this.audioStreamManager.streamAudioChunks(), mode)
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
  }

  public stopStreaming() {
    this.audioStreamManager.stopStreaming()
    // Note: Don't clear interaction here - it will be cleared after saving to database
    // this.interactionManager.clearCurrentInteraction()
    // ;(globalThis as any).currentInteractionId = null
  }

  public forwardAudioChunk(chunk: Buffer) {
    this.audioStreamManager.addAudioChunk(chunk)
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

      // Save failed interaction to database
      await this.interactionManager.createInteraction(
        response.transcript || '',
        this.audioStreamManager.getInteractionAudioBuffer(),
        this.audioStreamManager.getCurrentSampleRate(),
        errorMessage,
      )

      // End the interaction after transcription error
      if (interactionId) {
        traceLogger.endInteraction(interactionId, 'TRANSCRIPTION_FAILED', {
          error: response.error.message,
          localInteractionId: this.interactionManager.getCurrentInteractionId(),
        })
        ;(globalThis as any).currentInteractionId = null
      }

      // Clear the interaction AFTER saving to database
      this.interactionManager.clearCurrentInteraction()
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

      // Clear the interaction AFTER saving to database
      this.interactionManager.clearCurrentInteraction()
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

  public stopTranscription() {
    this.audioStreamManager.stopStreaming()
    // Note: Don't clear interaction here - wait for transcription response to save it first
    // this.interactionManager.clearCurrentInteraction()
    this.audioStreamManager.clearInteractionAudio()
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
