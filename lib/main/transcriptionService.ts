import { grpcClient } from '../clients/grpcClient'
import log from 'electron-log'
import { ItoMode } from '@/app/generated/ito_pb'
import { BrowserWindow } from 'electron'
import { AudioStreamManager } from './audio/AudioStreamManager'
import { interactionManager } from './interactions/InteractionManager'
import { WindowMessenger } from './messaging/WindowMessenger'
import { TextInserter } from './text/TextInserter'
import { getCursorContext } from '../media/selected-text-reader'
import { canGetContextFromCurrentApp } from '../utils/applicationDetection'
import { grammarRulesService } from './grammar/GrammarRulesService'

export class TranscriptionService {
  private audioStreamManager = new AudioStreamManager()
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
    const existingId = interactionManager.getCurrentInteractionId()
    if (existingId) {
      interactionManager.adoptInteractionId(existingId)
      this.interactionId = existingId
    } else {
      this.interactionId = interactionManager.startInteraction()
    }
    log.info('[TranscriptionService] Starting new transcription stream.')

    return true
  }

  public stopStreaming() {
    // If we never started gRPC due to insufficient audio, handle cleanup
    if (!this.hasStartedGrpc) {
      interactionManager.clearCurrentInteraction()
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
      interactionId: interactionManager.getCurrentInteractionId(),
    })

    const errorMessage = response.error ? response.error.message : undefined

    // Handle any transcription error
    if (response.error) {
      // Save failed interaction to database
      await interactionManager.createInteraction(
        response.transcript || '',
        this.audioStreamManager.getInteractionAudioBuffer(),
        this.audioStreamManager.getCurrentSampleRate(),
        errorMessage,
      )

      this.audioStreamManager.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
      this.isFinalizing = false
    } else {
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

        await this.textInserter.insertText(correctedText)

        // Create interaction in database
        await interactionManager.createInteraction(
          response.transcript,
          this.audioStreamManager.getInteractionAudioBuffer(),
          this.audioStreamManager.getCurrentSampleRate(),
          errorMessage,
        )
      }

      // Send transcription result to main window
      this.windowMessenger.sendTranscriptionResult(response)

      this.audioStreamManager.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
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

    // Clear current interaction on error
    interactionManager.clearCurrentInteraction()
    this.audioStreamManager.clearInteractionAudio()
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
        // Only clear if we never started gRPC; success/error handlers will clear otherwise
        if (!this.hasStartedGrpc) {
          interactionManager.clearCurrentInteraction()
        }
        // Unlock only if nothing else is finalizing
        if (!this.isFinalizing) {
          this.isFinalizing = false
        }
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
