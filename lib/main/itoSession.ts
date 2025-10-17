import { ItoMode } from '@/app/generated/ito_pb'
import { voiceInputService } from './voiceInputService'
import { recordingStateNotifier } from './recordingStateNotifier'
import { itoStreamController } from './itoStreamController'
import { WindowMessenger } from './messaging/WindowMessenger'
import { TextInserter } from './text/TextInserter'
import { interactionManager } from './interactions/InteractionManager'
import { contextGrabber } from './context/ContextGrabber'
import { grammarRulesService } from './grammar/GrammarRulesService'
import log from 'electron-log'

export class ItoSession {
  private readonly MINIMUM_AUDIO_DURATION_MS = 100
  private windowMessenger = new WindowMessenger()
  private textInserter = new TextInserter()
  private streamResponsePromise: Promise<{
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }> | null = null

  public async startSession(mode: ItoMode) {
    log.info('[ItoSession] Starting session with mode:', mode)

    // Start grpc stream (must happen before audio starts flowing)
    const started = await itoStreamController.startInteraction(mode)
    if (!started) {
      log.error('[ItoSession] Failed to start itoStreamController')
      return
    }

    // Start streaming audio immediately - save the promise to wait for it in completeSession
    this.streamResponsePromise = itoStreamController.startGrpcStream()

    // Send initial mode to the stream
    itoStreamController.setMode(mode)

    // Begin recording audio (audio bytes will now flow into the gRPC stream)
    voiceInputService.startAudioRecording()

    // Update UI state
    recordingStateNotifier.notifyRecordingStarted(mode)

    log.info(
      '[ItoSession] Session started - audio flowing, fetching context in background',
    )

    // Fetch and send context in the background (non-blocking)
    this.fetchAndSendContext().catch(error => {
      log.error('[ItoSession] Failed to fetch/send context:', error)
    })
  }

  private async fetchAndSendContext() {
    log.info('[ItoSession] Fetching context in background...')

    // This builds the full config (window context, selected text, vocabulary, settings)
    await itoStreamController.sendConfigUpdate()

    log.info('[ItoSession] Context sent to stream')
  }

  public setMode(mode: ItoMode) {
    log.info('[ItoSession] Changing mode to:', mode)

    // Send mode change to grpc stream (will also update windows via recordingStateNotifier)
    itoStreamController.setMode(mode)

    // Update UI to show the new mode
    recordingStateNotifier.notifyRecordingStarted(mode)
  }

  public async cancelSession() {
    log.info('[ItoSession] Cancelling session')

    // Cancel the transcription (will not create interaction)
    itoStreamController.cancelTranscription()

    // Stop audio recording
    await voiceInputService.stopAudioRecording()

    // Update UI state
    recordingStateNotifier.notifyRecordingStopped()

    log.info('[ItoSession] Session cancelled')
  }

  public async completeSession() {
    log.info('[ItoSession] Completing session')

    // Stop audio recording and wait for drain
    await voiceInputService.stopAudioRecording()

    // Check actual audio duration (keyboard duration can be misleading due to latency)
    const audioDurationMs = itoStreamController.getAudioDurationMs()
    log.info(`[ItoSession] Audio duration: ${audioDurationMs}ms`)

    if (audioDurationMs < this.MINIMUM_AUDIO_DURATION_MS) {
      log.info(
        `[ItoSession] Audio too short (${audioDurationMs}ms < ${this.MINIMUM_AUDIO_DURATION_MS}ms), cancelling`,
      )
      itoStreamController.cancelTranscription()
      recordingStateNotifier.notifyRecordingStopped()
      this.streamResponsePromise = null
      return
    }

    // End the interaction (this will complete the gRPC stream)
    itoStreamController.endInteraction()

    // Update UI state
    recordingStateNotifier.notifyRecordingStopped()

    // Wait for the stream response and handle it
    if (this.streamResponsePromise) {
      try {
        const result = await this.streamResponsePromise
        await this.handleTranscriptionResponse(result)
      } catch (error) {
        await this.handleTranscriptionError(error)
      } finally {
        this.streamResponsePromise = null
      }
    }

    log.info('[ItoSession] Session completed')
  }

  private async handleTranscriptionResponse(result: {
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }) {
    const { response, audioBuffer, sampleRate } = result

    log.info('[ItoSession] Processing transcription response:', {
      transcript: response.transcript,
      transcriptLength: response.transcript?.length || 0,
      hasTranscript: !!response.transcript,
      hasError: !!response.error,
      errorCode: response.error?.code,
      interactionId: interactionManager.getCurrentInteractionId(),
    })

    const errorMessage = response.error ? response.error.message : undefined

    // Handle any transcription error
    if (response.error) {
      await interactionManager.createInteraction(
        response.transcript || '',
        audioBuffer,
        sampleRate,
        errorMessage,
      )

      itoStreamController.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
    } else {
      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        // Get cursor context for grammar rules (capitalization, spacing, etc.)
        const cursorContext = await contextGrabber.getCursorContextForGrammar(4)

        // Apply grammar rules with cursor context
        let correctedText = grammarRulesService.setCaseFirstWord(
          cursorContext,
          response.transcript,
        )
        correctedText = grammarRulesService.addLeadingSpaceIfNeeded(
          cursorContext,
          correctedText,
        )

        await this.textInserter.insertText(correctedText)

        // Create interaction in database
        await interactionManager.createInteraction(
          response.transcript,
          audioBuffer,
          sampleRate,
          errorMessage,
        )
      }

      // Send transcription result to main window
      this.windowMessenger.sendTranscriptionResult(response)

      itoStreamController.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
    }
  }

  private async handleTranscriptionError(error: any) {
    log.error(
      '[ItoSession] An unexpected error occurred during transcription:',
      error,
    )

    // Send transcription error to main window
    this.windowMessenger.sendTranscriptionError(error)

    // Clear current interaction on error
    interactionManager.clearCurrentInteraction()
    itoStreamController.clearInteractionAudio()
  }

  public setMainWindow(mainWindow: any) {
    this.windowMessenger.setMainWindow(mainWindow)
  }
}

export const itoSession = new ItoSession()
