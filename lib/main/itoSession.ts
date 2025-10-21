import { ItoMode } from '@/app/generated/ito_pb'
import { voiceInputService } from './voiceInputService'
import { recordingStateNotifier } from './recordingStateNotifier'
import { itoStreamController } from './itoStreamController'
import { WindowMessenger } from './messaging/WindowMessenger'
import { TextInserter } from './text/TextInserter'
import { interactionManager } from './interactions/InteractionManager'
import { contextGrabber } from './context/ContextGrabber'
import { grammarRulesService } from './grammar/GrammarRulesService'
import { getAdvancedSettings } from './store'
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

    // Initialize all necessary components
    const started = await itoStreamController.startInteraction(mode)
    if (!started) {
      log.error('[ItoSession] Failed to start itoStreamController')
      return
    }

    // Begin gRPC stream immediately (note, no audio is flowing yet)
    this.streamResponsePromise = itoStreamController.startGrpcStream()

    // Begin recording audio (audio bytes will now flow into the gRPC stream)
    voiceInputService.startAudioRecording()

    // Send initial mode to the stream
    itoStreamController.setMode(mode)

    // Update UI state
    recordingStateNotifier.notifyRecordingStarted(mode)

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

    // Fetch cursor context for grammar rules only if grammar service is enabled
    const { grammarServiceEnabled } = getAdvancedSettings()
    if (grammarServiceEnabled) {
      const cursorContext = await contextGrabber.getCursorContextForGrammar()
      grammarRulesService.setCursorContext(cursorContext)
      log.info('[ItoSession] Cursor context set for grammar rules')
    }
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

    // Wait for the stream promise to reject with cancellation error
    if (this.streamResponsePromise) {
      try {
        await this.streamResponsePromise
      } catch (error) {
        // Expected cancellation error, log and ignore
        log.info('[ItoSession] Stream cancelled as expected:', error)
      }
      this.streamResponsePromise = null
    }

    // Clear cursor context on cancel
    grammarRulesService.clearCursorContext()

    log.info('[ItoSession] Session cancelled')
  }

  public async completeSession() {
    // Stop audio recording and wait for drain
    await voiceInputService.stopAudioRecording()

    // Check actual audio duration (keyboard duration can be misleading due to latency)
    const audioDurationMs = itoStreamController.getAudioDurationMs()

    if (audioDurationMs < this.MINIMUM_AUDIO_DURATION_MS) {
      log.info(
        `[ItoSession] Audio too short (${audioDurationMs}ms < ${this.MINIMUM_AUDIO_DURATION_MS}ms), cancelling`,
      )
      itoStreamController.cancelTranscription()
      recordingStateNotifier.notifyRecordingStopped()

      // Wait for the stream promise to reject with cancellation error
      if (this.streamResponsePromise) {
        try {
          await this.streamResponsePromise
        } catch (error) {
          // Expected cancellation error, log and ignore
          log.info('[ItoSession] Stream cancelled as expected:', error)
        }
        this.streamResponsePromise = null
      }
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
  }

  private async handleTranscriptionResponse(result: {
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }) {
    const { response, audioBuffer, sampleRate } = result

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
        let textToInsert = response.transcript

        // Apply grammar rules only if grammar service is enabled
        const { grammarServiceEnabled } = getAdvancedSettings()
        if (grammarServiceEnabled) {
          textToInsert = grammarRulesService.setCaseFirstWord(textToInsert)
          textToInsert =
            grammarRulesService.addLeadingSpaceIfNeeded(textToInsert)
        }

        await this.textInserter.insertText(textToInsert)

        // Create interaction in database
        await interactionManager.createInteraction(
          response.transcript,
          audioBuffer,
          sampleRate,
          errorMessage,
        )
      } else {
        log.warn('[ItoSession] Skipping text insertion:', {
          hasTranscript: !!response.transcript,
          transcriptLength: response.transcript?.length || 0,
          hasError: !!response.error,
        })
      }

      // Send transcription result to main window
      this.windowMessenger.sendTranscriptionResult(response)

      itoStreamController.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
    }

    // Clear cursor context after handling response
    grammarRulesService.clearCursorContext()
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

    // Clear cursor context after error
    grammarRulesService.clearCursorContext()
  }

  public setMainWindow(mainWindow: any) {
    this.windowMessenger.setMainWindow(mainWindow)
  }
}

export const itoSession = new ItoSession()
