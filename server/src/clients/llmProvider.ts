import { ItoMode } from '../services/ito/constants.js'
import { WindowContext } from '../services/ito/types.js'
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
    mode: ItoMode,
    context?: WindowContext,
    options?: IntentTranscriptionOptions,
  ): Promise<string>
}
