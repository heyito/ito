import { TranscriptionOptions } from './asrConfig.js'
import { IntentTranscriptionOptions } from './intentTranscriptionConfig.js'

export interface LlmProvider {
  readonly isAvailable: boolean

  transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<string>

  adjustTranscript(
    transcript: string,
    options?: IntentTranscriptionOptions,
  ): Promise<string>
}
