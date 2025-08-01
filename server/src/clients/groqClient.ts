import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk/uploads'
import * as dotenv from 'dotenv'
import { ItoMode, MODE_PROMPT } from '../services/itoService.js'

// Load environment variables from .env file
dotenv.config()
const itoVocabulary = ['ito']

/**
 * A TypeScript client for interacting with the Groq API, inspired by your Python implementation.
 */
class GroqClient {
  private readonly _client: Groq
  private readonly _userCommandModel: string
  private readonly _asrModel: string
  private readonly _isValid: boolean

  constructor(apiKey: string, userCommandModel: string, asrModel: string) {
    if (!apiKey) {
      throw new Error('Groq API key is required.')
    }
    this._client = new Groq({ apiKey })
    this._userCommandModel = userCommandModel
    this._asrModel = asrModel
    this._isValid = true
  }

  /**
   * Checks if the client is configured correctly.
   */
  public get isAvailable(): boolean {
    return this._isValid
  }

  /**
   * Gets the configured model name for Automatic Speech Recognition (ASR).
   */
  public get asrModelName(): string {
    return this._asrModel
  }

  /**
   * Uses a thinking model to adjust/improve a transcript.
   * @param transcript The original transcript text.
   * @returns The adjusted transcript.
   */
  public async adjustTranscript(
    transcript: string,
    mode: ItoMode,
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Groq client is not available. Check API key.')
    }
    const defaultPrompt =
      'You are a dictation assistant named Ito. Your job is to fulfill the intent of the transcript without asking follow up questions.'
    try {
      const completion = await this._client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: MODE_PROMPT[mode] || defaultPrompt,
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
      })

      return completion.choices[0]?.message?.content?.trim() || transcript
    } catch (error: any) {
      console.error('An error occurred during transcript adjustment:', error)
      return transcript
    }
  }

  /**
   * Transcribes an audio buffer using the Groq API.
   * @param audioBuffer The audio data as a Node.js Buffer.
   * @param fileType The extension of the audio file type (e.g., 'webm', 'wav').
   * @param vocabulary Optional custom vocabulary to improve transcription accuracy.
   * @returns The transcribed text as a string.
   */
  public async transcribeAudio(
    audioBuffer: Buffer,
    fileType: string = 'webm',
    vocabulary?: string[],
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Groq client is not available. Check API key.')
    }
    if (!this._asrModel) {
      throw new Error('Groq ASR model is not configured.')
    }

    try {
      console.log(
        `Transcribing ${audioBuffer.length} bytes of audio using model ${this._asrModel}...`,
      )

      const fullVocabulary = [...itoVocabulary, ...(vocabulary || [])]

      const transcription = await this._client.audio.transcriptions.create({
        // The toFile helper correctly handles buffers for multipart/form-data uploads.
        // Providing a filename with the correct extension is crucial for the API.
        file: await toFile(audioBuffer, `audio.${fileType}`),
        model: this._asrModel,
        prompt: fullVocabulary.join(', '),
      })

      // The Node SDK returns the full object, the text is in the `text` property.
      return transcription.text.trim()
    } catch (error: any) {
      console.error('An error occurred during Groq transcription:', error)
      // Re-throw the error to be handled by the caller (e.g., the gRPC service handler).
      throw new Error(
        `Groq API Error: ${error.message || 'An unknown error occurred'}`,
      )
    }
  }
}

// --- Singleton Instance ---
// Create and export a single, pre-configured instance of the client for use across the server.
// log error if groq api key or transcription model is not set
if (!process.env.GROQ_API_KEY || !process.env.GROQ_TRANSCRIPTION_MODEL) {
  console.error(
    'FATAL: GROQ_API_KEY or GROQ_TRANSCRIPTION_MODEL is not set in the .env file. The application cannot start.',
  )
  process.exit(1)
}
const apiKey = process.env.GROQ_API_KEY
const asrModel = process.env.GROQ_TRANSCRIPTION_MODEL
if (!apiKey) {
  console.error(
    'FATAL: GROQ_API_KEY is not set in the .env file. The application cannot start.',
  )
  process.exit(1)
}

// Note: userCommandModel is empty for now as we are only using transcription.
export const groqClient = new GroqClient(apiKey, '', asrModel)
