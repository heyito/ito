import { grpcClient } from '../clients/grpcClient'
import log from 'electron-log'

/**
 * A service layer that sits between the raw audio capture
 * and the gRPC client to provide better separation of concerns.
 */
class TranscriptionService {
  private isTranscribing: boolean = false

  /**
   * Starts a transcription session.
   * This should be called when a recording session begins (e.g., hotkey press).
   */
  public startTranscription() {
    if (this.isTranscribing) {
      log.warn(
        '[TranscriptionService] Already transcribing, stopping the previous session first.',
      )
      grpcClient.stopStream() // Stop the previous session if it's still active
    }
    log.info('[TranscriptionService] Starting transcription.')
    this.isTranscribing = true
    // Tell the gRPC client to open a new stream to the server.
    grpcClient.startStream()
  }

  /**
   * Forwards a raw audio chunk to the gRPC client.
   * This is called by the audio recorder every time it has new data.
   * @param audioChunk A raw buffer of audio data.
   */
  public handleAudioChunk(audioChunk: Buffer) {
    // Only forward the chunk if we are in a transcribing session.
    if (this.isTranscribing) {
      grpcClient.sendAudioChunk(audioChunk)
    }
  }

  /**
   * Ends the current transcription session.
   * This should be called when a recording session ends (e.g., hotkey release).
   */
  public stopTranscription() {
    if (!this.isTranscribing) {
      return
    }
    log.info('[TranscriptionService] Stopping transcription.')
    this.isTranscribing = false
    // Tell the gRPC client to close the stream and finalize the transcription.
    grpcClient.stopStream()
  }
}

// Export a singleton instance of the service.
export const transcriptionService = new TranscriptionService()
