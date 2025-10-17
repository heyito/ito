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
import { getAdvancedSettings } from './store'

export class TranscriptionService {
  private audioStreamManager = new AudioStreamManager()
  private windowMessenger = new WindowMessenger()
  private textInserter = new TextInserter()
  private hasStartedGrpc = false
  private currentMode: ItoMode | null = null
  private interactionId: string | null = null

  public async startTranscription(mode: ItoMode): Promise<boolean> {
    // Guard against multiple concurrent transcriptions
    if (this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[TranscriptionService] Stream already in progress.')
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
    const errorCode = response.error ? response.error.code : undefined

    // Handle any transcription error
    if (response.error) {
      // Save failed interaction to database
      await interactionManager.createInteraction(
        response.transcript || '',
        this.audioStreamManager.getInteractionAudioBuffer(),
        this.audioStreamManager.getCurrentSampleRate(),
        errorMessage,
        errorCode,
      )

      this.audioStreamManager.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
    } else {
      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        const { grammarServiceEnabled } = getAdvancedSettings()
        console.log(
          '[TranscriptionService] Inserting text with grammar correction:',
          grammarServiceEnabled ? 'enabled' : 'disabled',
        )
        let textToInsert = response.transcript

        if (grammarServiceEnabled) {
          const contextLength = 4 // Number of chars to consider for context
          let context = ''
          try {
            const canGetContext = await canGetContextFromCurrentApp()
            if (canGetContext) {
              context = (await getCursorContext(contextLength)) || ''
            }
          } catch (e) {
            console.error('Cursor context failed:', e)
          }

          textToInsert = grammarRulesService.setCaseFirstWord(
            context,
            textToInsert,
          )
          textToInsert = grammarRulesService.addLeadingSpaceIfNeeded(
            context,
            textToInsert,
          )
        }

        await this.textInserter.insertText(textToInsert)

        // Create interaction in database
        await interactionManager.createInteraction(
          response.transcript,
          this.audioStreamManager.getInteractionAudioBuffer(),
          this.audioStreamManager.getCurrentSampleRate(),
          errorMessage,
          errorCode,
        )
      }

      // Send transcription result to main window
      this.windowMessenger.sendTranscriptionResult(response)

      this.audioStreamManager.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
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
  }

  public stopTranscription() {
    this.audioStreamManager.stopStreaming()
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
