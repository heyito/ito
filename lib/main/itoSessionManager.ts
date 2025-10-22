import { ItoMode } from '@/app/generated/ito_pb'
import { voiceInputService } from './voiceInputService'
import { recordingStateNotifier } from './recordingStateNotifier'
import { itoStreamController } from './itoStreamController'
import { TextInserter } from './text/TextInserter'
import { interactionManager } from './interactions/InteractionManager'
import { contextGrabber } from './context/ContextGrabber'
import { GrammarRulesService } from './grammar/GrammarRulesService'
import { getAdvancedSettings } from './store'
import log from 'electron-log'

export class ItoSessionManager {
  private readonly MINIMUM_AUDIO_DURATION_MS = 100
  private textInserter = new TextInserter()
  private streamResponsePromise: Promise<{
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }> | null = null
  private grammarRulesService = new GrammarRulesService('')

  public async startSession(mode: ItoMode) {
    console.log('[itoSessionManager] Starting session with mode:', mode)

    // Initialize all necessary components
    const started = await itoStreamController.initialize(mode)
    if (!started) {
      log.error('[itoSessionManager] Failed to initialize itoStreamController')
      return
    }

    // Reuse existing global interaction ID if present, otherwise create a new one
    const existingId = interactionManager.getCurrentInteractionId()
    if (existingId) {
      interactionManager.adoptInteractionId(existingId)
    } else {
      interactionManager.initialize()
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
      log.error('[itoSessionManager] Failed to fetch/send context:', error)
    })
  }

  private async fetchAndSendContext() {
    console.log('[itoSessionManager] Fetching context in background...')

    // This builds the full config (window context, selected text, vocabulary, settings)
    await itoStreamController.sendConfigUpdate()

    console.log('[itoSessionManager] Context sent to stream')

    // Fetch cursor context for grammar rules only if grammar service is enabled
    const { grammarServiceEnabled } = getAdvancedSettings()
    if (grammarServiceEnabled) {
      const cursorContext = await contextGrabber.getCursorContextForGrammar()
      this.grammarRulesService = new GrammarRulesService(cursorContext)
      console.log('[itoSessionManager] Cursor context set for grammar rules')
    }
  }

  public setMode(mode: ItoMode) {
    console.log('[itoSessionManager] Changing mode to:', mode)

    // Send mode change to grpc stream (will also update windows via recordingStateNotifier)
    itoStreamController.setMode(mode)

    // Update UI to show the new mode
    recordingStateNotifier.notifyRecordingStarted(mode)
  }

  public async cancelSession() {
    console.log('[itoSessionManager] Cancelling session')

    // Cancel the transcription (will not create interaction)
    itoStreamController.cancelTranscription()
    interactionManager.clearCurrentInteraction()

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
        console.log('[itoSessionManager] Stream cancelled as expected:', error)
      }
      this.streamResponsePromise = null
    }

    console.log('[itoSessionManager] Session cancelled')
  }

  public async completeSession() {
    // Stop audio recording and wait for drain
    await voiceInputService.stopAudioRecording()

    // Check actual audio duration (keyboard duration can be misleading due to latency)
    const audioDurationMs = itoStreamController.getAudioDurationMs()

    if (audioDurationMs < this.MINIMUM_AUDIO_DURATION_MS) {
      console.log(
        `[itoSessionManager] Audio too short (${audioDurationMs}ms < ${this.MINIMUM_AUDIO_DURATION_MS}ms), cancelling`,
      )
      itoStreamController.cancelTranscription()
      recordingStateNotifier.notifyRecordingStopped()

      // Wait for the stream promise to reject with cancellation error
      if (this.streamResponsePromise) {
        try {
          await this.streamResponsePromise
        } catch (error) {
          // Expected cancellation error, log and ignore
          console.log(
            '[itoSessionManager] Stream cancelled as expected:',
            error,
          )
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

      interactionManager.clearCurrentInteraction()
    } else {
      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        let textToInsert = response.transcript

        // Apply grammar rules only if grammar service is enabled
        const { grammarServiceEnabled } = getAdvancedSettings()
        if (grammarServiceEnabled) {
          textToInsert = this.grammarRulesService.setCaseFirstWord(textToInsert)
          textToInsert =
            this.grammarRulesService.addLeadingSpaceIfNeeded(textToInsert)
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
        log.warn('[itoSessionManager] Skipping text insertion:', {
          hasTranscript: !!response.transcript,
          transcriptLength: response.transcript?.length || 0,
          hasError: !!response.error,
        })
      }

      interactionManager.clearCurrentInteraction()
    }
  }

  private async handleTranscriptionError(error: any) {
    log.error(
      '[itoSessionManager] An unexpected error occurred during transcription:',
      error,
    )

    // Clear current interaction on error
    interactionManager.clearCurrentInteraction()
  }
}

export const itoSessionManager = new ItoSessionManager()
