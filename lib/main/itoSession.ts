import { ItoMode } from '@/app/generated/ito_pb'
import { voiceInputService } from './voiceInputService'
import { recordingStateNotifier } from './recordingStateNotifier'
import { itoStreamController } from './itoStreamController'
import log from 'electron-log'

export class ItoSession {
  private readonly MINIMUM_AUDIO_DURATION_MS = 100

  public async startSession(mode: ItoMode) {
    log.info('[ItoSession] Starting session with mode:', mode)

    // Start grpc stream (must happen before audio starts flowing)
    const started = await itoStreamController.startInteraction(mode)
    if (!started) {
      log.error('[ItoSession] Failed to start itoStreamController')
      return
    }

    // Start streaming audio immediately
    itoStreamController.startGrpcStream()

    // Send initial mode to the stream
    itoStreamController.changeMode(mode)

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

  public changeMode(mode: ItoMode) {
    log.info('[ItoSession] Changing mode to:', mode)

    // Send mode change to grpc stream (will also update windows via recordingStateNotifier)
    itoStreamController.changeMode(mode)

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
      return
    }

    // End the interaction (this will complete the gRPC stream)
    // The transcript will be automatically pasted by itoStreamController when the response comes back
    itoStreamController.endInteraction()

    // Update UI state
    recordingStateNotifier.notifyRecordingStopped()

    log.info('[ItoSession] Session completed')
  }
}

export const itoSession = new ItoSession()
