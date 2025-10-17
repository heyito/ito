import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk/uploads'
import * as dotenv from 'dotenv'
import { createTranscriptionPrompt } from '../prompts/transcription.js'
import {
  ClientApiKeyError,
  ClientUnavailableError,
  ClientModelError,
  ClientNoSpeechError,
  ClientTranscriptionQualityError,
  ClientAudioTooShortError,
  ClientApiError,
  ClientError,
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
 * A TypeScript client for interacting with the Groq API, inspired by your Python implementation.
 */
class GroqClient implements LlmProvider {
  private readonly _client: Groq
  private readonly _userCommandModel: string
  private readonly _isValid: boolean

  constructor(apiKey: string, userCommandModel: string) {
    if (!apiKey) {
      throw new ClientApiKeyError(ClientProvider.GROQ)
    }
    this._client = new Groq({ apiKey })
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
      throw new ClientUnavailableError(ClientProvider.GROQ)
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

      // Return a space to enable emptying the document
      return completion.choices[0]?.message?.content?.trim() || ' '
    } catch (error: any) {
      console.error('An error occurred during transcript adjustment:', error)
      return userPrompt
    }
  }

  /**
   * Calculate a robust average log probability across all segments.
   * Uses the median of available avg_logprob values to reduce outlier impact.
   */
  private calcAvgLogprob(segments: any[]): number | null {
    if (!Array.isArray(segments) || segments.length === 0) return null
    const values = segments
      .map(s => s?.avg_logprob)
      .filter((v: any) => typeof v === 'number' && isFinite(v)) as number[]
    if (values.length === 0) return null
    values.sort((a, b) => a - b)
    const mid = Math.floor(values.length / 2)
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid]
  }

  /**
   * Transcribes an audio buffer using the Groq API.
   * @param audioBuffer The audio data as a Node.js Buffer.
   * @param options Optional transcription configuration.
   * @returns The transcribed text as a string.
   */
  public async transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<string> {
    console.log('Transcribing audio with options:', options)
    const fileType = options?.fileType || 'webm'
    const asrModel = options?.asrModel
    const vocabulary = options?.vocabulary
    const noSpeechThreshold =
      options?.noSpeechThreshold ?? DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold
    const lowQualityThreshold =
      options?.lowQualityThreshold ??
      DEFAULT_ADVANCED_SETTINGS.lowQualityThreshold

    const file = await toFile(audioBuffer, `audio.${fileType}`)
    if (!this.isAvailable) {
      throw new ClientUnavailableError(ClientProvider.GROQ)
    }
    if (!asrModel) {
      throw new ClientModelError(ClientProvider.GROQ)
    }

    try {
      console.log(
        `Transcribing ${audioBuffer.length} bytes of audio using model ${asrModel}...`,
      )

      const fullVocabulary = [...itoVocabulary, ...(vocabulary || [])]

      // Create a concise but effective transcription prompt
      const transcriptionPrompt = createTranscriptionPrompt(fullVocabulary)

      const transcription = await this._client.audio.transcriptions.create({
        // The toFile helper correctly handles buffers for multipart/form-data uploads.
        // Providing a filename with the correct extension is crucial for the API.
        file,
        model: asrModel,
        prompt: transcriptionPrompt,
        response_format: 'verbose_json',
      })

      const segments = (transcription as any).segments
      if (segments && segments.length > 0) {
        const first = segments[0]
        if (first?.no_speech_prob > noSpeechThreshold) {
          console.log('No speech probability:', first.no_speech_prob)
          throw new ClientNoSpeechError(
            ClientProvider.GROQ,
            first.no_speech_prob,
          )
        }
        const robustAvg = this.calcAvgLogprob(segments)
        if (typeof robustAvg === 'number') {
          if (robustAvg < lowQualityThreshold) {
            console.log('Low quality probability (robust avg):', robustAvg)
            throw new ClientTranscriptionQualityError(
              ClientProvider.GROQ,
              robustAvg,
            )
          }
        }
      }

      // The Node SDK returns the full object, the text is in the `text` property.
      return transcription.text.trim()
    } catch (error: any) {
      console.log(
        `Failed to transcribe audio of size ${audioBuffer.length} bytes.`,
      )
      console.error('An error occurred during Groq transcription:', error)
      if (error instanceof ClientError) {
        throw error
      }

      const errorMessage = error.message || 'An unknown error occurred'

      // Check for specific audio too short error
      if (errorMessage.includes('Audio file is too short')) {
        throw new ClientAudioTooShortError(ClientProvider.GROQ)
      }

      // Re-throw the error to be handled by the caller (e.g., the gRPC service handler).
      throw new ClientApiError(
        errorMessage,
        ClientProvider.GROQ,
        error,
        error.status || error.statusCode,
      )
    }
  }
}

// --- Singleton Instance ---
// Create and export a single, pre-configured instance of the client for use across the server.
// Only check for GROQ_API_KEY since ASR model is now provided per-request
if (!process.env.GROQ_API_KEY) {
  console.error(
    'FATAL: GROQ_API_KEY is not set in the .env file. The application cannot start.',
  )
  process.exit(1)
}
const apiKey = process.env.GROQ_API_KEY

// Note: userCommandModel is empty for now as we are only using transcription.
export const groqClient = new GroqClient(apiKey, '')
