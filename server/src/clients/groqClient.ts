import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk/uploads'
import * as dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

/**
 * A TypeScript client for interacting with the Groq API, inspired by your Python implementation.
 */
class GroqClient {
  private _client: Groq | undefined
  private _userCommandModel: string | undefined
  private _asrModel: string | undefined
  private _ready: boolean = false

  constructor() {}

  public async initialize(
    apiKey: string,
    userCommandModel: string,
    asrModel: string,
  ): Promise<void> {
    if (!apiKey) {
      throw new Error('Groq API key is required.')
    }

    this._client = new Groq({ apiKey })
    this._userCommandModel = userCommandModel
    this._asrModel = asrModel
    this._ready = true
  }

  /**
   * Checks if the client is configured correctly.
   */
  public get isAvailable(): boolean {
    return this._ready
  }

  /**
   * Gets the configured model name for Automatic Speech Recognition (ASR).
   */
  public get asrModelName(): string {
    if (!this._asrModel) {
      throw new Error(
        'Groq client is not initialized. Call initialize() first.',
      )
    }

    return this._asrModel
  }

  /**
   * Transcribes an audio buffer using the Groq API.
   * @param audioBuffer The audio data as a Node.js Buffer.
   * @param fileType The extension of the audio file type (e.g., 'webm', 'wav').
   * @returns The transcribed text as a string.
   */
  public async transcribeAudio(
    audioBuffer: Buffer,
    fileType: string = 'webm',
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Groq client is not available. Check API key.')
    }
    if (!this._asrModel) {
      throw new Error('Groq ASR model is not configured.')
    }

    if (!this._client) {
      throw new Error(
        'Groq client is not initialized. Call initialize() first.',
      )
    }

    try {
      console.log(
        `Transcribing ${audioBuffer.length} bytes of audio using model ${this._asrModel}...`,
      )

      const transcription = await this._client.audio.transcriptions.create({
        // The toFile helper correctly handles buffers for multipart/form-data uploads.
        // Providing a filename with the correct extension is crucial for the API.
        file: await toFile(audioBuffer, `audio.${fileType}`),
        model: this._asrModel,
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

  // You can add the other methods like `generateResponse` here as well if needed.
  // For now, we will focus on the transcription functionality.
}

// --- Singleton Instance ---
// Create and export a single, pre-configured instance of the client for use across the server.
export const groqClient = new GroqClient()
