import Cerebras from '@cerebras/cerebras_cloud_sdk'
import * as dotenv from 'dotenv'
import {
  ClientApiKeyError,
  ClientUnavailableError,
  ClientApiError,
} from './errors.js'
import { ClientProvider } from './providers.js'
import { LlmProvider } from './llmProvider.js'
import { TranscriptionOptions } from './asrConfig.js'
import { IntentTranscriptionOptions } from './intentTranscriptionConfig.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults.js'

// Load environment variables from .env file
dotenv.config()
export const itoVocabulary = ['Ito', 'Hey Ito']

/**
 * A TypeScript client for interacting with the Cerebras API.
 */
class CerebrasClient implements LlmProvider {
  private readonly _client: Cerebras
  private readonly _userCommandModel: string
  private readonly _isValid: boolean

  constructor(apiKey: string, userCommandModel: string) {
    if (!apiKey) {
      throw new ClientApiKeyError(ClientProvider.CEREBRAS)
    }
    this._client = new Cerebras({ apiKey })
    this._userCommandModel = userCommandModel
    this._isValid = true
  }

  /**
   * Checks if the client is configured correctly.
   */
  public get isAvailable(): boolean {
    return this._isValid
  }

  /**
   * Uses a thinking model to adjust/improve a transcript.
   * @param transcript The original transcript text.
   * @returns The adjusted transcript.
   */
  public async adjustTranscript(
    userPrompt: string,
    options?: IntentTranscriptionOptions,
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new ClientUnavailableError(ClientProvider.CEREBRAS)
    }

    const temperature = options?.temperature ?? 0.7
    const model = options?.model || this._userCommandModel
    const systemPrompt =
      options?.prompt ||
      'Adjust and improve this transcript for clarity and accuracy.'

    try {
      const completion = await this._client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        model,
        temperature,
      })

      return (completion.choices as any)[0]?.message?.content?.trim() || ' '
    } catch (error: any) {
      console.error('An error occurred during transcript adjustment:', error)
      return userPrompt
    }
  }

  /**
   * Transcribes an audio buffer using the Cerebras API.
   * Note: Cerebras currently focuses on text generation, not audio transcription.
   * This implementation throws an error as audio transcription is not supported.
   * @param audioBuffer The audio data as a Node.js Buffer.
   * @param options Optional transcription configuration.
   * @returns The transcribed text as a string.
   */
  public async transcribeAudio(
    _audioBuffer: Buffer,
    _options?: TranscriptionOptions,
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new ClientUnavailableError(ClientProvider.CEREBRAS)
    }

    // Cerebras doesn't currently support audio transcription
    // We should throw an error indicating this feature is not supported
    throw new ClientApiError(
      'Audio transcription is not supported by Cerebras. Please use a different ASR provider.',
      ClientProvider.CEREBRAS,
      new Error('Feature not supported'),
      501, // Not Implemented
    )
  }
}

// --- Singleton Instance ---
// Create and export a single, pre-configured instance of the client for use across the server.
// Check for CEREBRAS_API_KEY and create client if available
const apiKey = process.env.CEREBRAS_API_KEY

let cerebrasClient: CerebrasClient | null = null

if (apiKey) {
  try {
    cerebrasClient = new CerebrasClient(
      apiKey,
      DEFAULT_ADVANCED_SETTINGS.llmModel,
    )
    console.log('Cerebras client initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Cerebras client:', error)
    cerebrasClient = null
  }
} else {
  console.log(
    'CEREBRAS_API_KEY not set - Cerebras client will not be available',
  )
  cerebrasClient = null
}

export { cerebrasClient }
