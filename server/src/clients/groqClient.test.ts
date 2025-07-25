import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'

// Mock environment variables before any imports
const originalEnv = process.env
process.env = {
  ...originalEnv,
  GROQ_API_KEY: 'test-api-key',
}

// Mock the Groq SDK
const mockGroqClient = {
  audio: {
    transcriptions: {
      create: mock(),
    },
  },
  chat: {
    completions: {
      create: mock(),
    },
  },
}

// Mock the groq-sdk module
mock.module('groq-sdk', () => ({
  default: class MockGroq {
    constructor() {
      return mockGroqClient
    }
  },
}))

// Mock the toFile function
mock.module('groq-sdk/uploads', () => ({
  toFile: mock((buffer: Buffer, filename: string) =>
    Promise.resolve({ buffer, filename }),
  ),
}))

// Mock dotenv to prevent .env file loading
mock.module('dotenv', () => ({
  config: mock(() => ({})),
}))

// Now we can safely import the groqClient
const { groqClient } = await import('./groqClient.js')

describe('GroqClient', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    mockGroqClient.audio.transcriptions.create.mockClear()
    mockGroqClient.chat.completions.create.mockClear()
  })

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('transcribeAudio', () => {
    it('should use the provided ASR model for transcription', async () => {
      const mockTranscription = { text: 'Hello world' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'
      const vocabulary = ['hello', 'world']

      const result = await groqClient.transcribeAudio(
        audioBuffer,
        'wav',
        asrModel,
        vocabulary,
      )

      expect(result).toBe('Hello world')
      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.wav',
        }),
        model: asrModel,
        prompt: 'ito, hello, world',
      })
    })

    it('should use default file type when not specified', async () => {
      const mockTranscription = { text: 'Test transcription' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'distil-whisper-large-v3-en'

      await groqClient.transcribeAudio(audioBuffer, undefined, asrModel)

      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.webm',
        }),
        model: asrModel,
        prompt: 'ito',
      })
    })

    it('should handle vocabulary properly', async () => {
      const mockTranscription = { text: 'Custom vocabulary test' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'
      const vocabulary = ['custom', 'vocabulary', 'test']

      await groqClient.transcribeAudio(audioBuffer, 'wav', asrModel, vocabulary)

      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.wav',
        }),
        model: asrModel,
        prompt: 'ito, custom, vocabulary, test',
      })
    })

    it('should handle empty vocabulary', async () => {
      const mockTranscription = { text: 'No vocabulary' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      await groqClient.transcribeAudio(audioBuffer, 'wav', asrModel, [])

      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.wav',
        }),
        model: asrModel,
        prompt: 'ito',
      })
    })

    it('should throw error when ASR model is not provided', async () => {
      const audioBuffer = Buffer.from('mock audio data')

      await expect(
        groqClient.transcribeAudio(audioBuffer, 'wav', ''),
      ).rejects.toThrow('ASR model is required for transcription.')
    })

    it('should trim whitespace from transcription result', async () => {
      const mockTranscription = { text: '  Hello world  ' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      const result = await groqClient.transcribeAudio(
        audioBuffer,
        'wav',
        asrModel,
      )

      expect(result).toBe('Hello world')
    })

    it('should handle Groq API errors properly', async () => {
      const mockError = new Error('Groq API error')
      mockGroqClient.audio.transcriptions.create.mockRejectedValue(mockError)

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      await expect(
        groqClient.transcribeAudio(audioBuffer, 'wav', asrModel),
      ).rejects.toThrow('Groq API Error: Groq API error')
    })
  })

  describe('adjustTranscript', () => {
    it('should use LLM to adjust transcript', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: 'Adjusted transcript content',
            },
          },
        ],
      }
      mockGroqClient.chat.completions.create.mockResolvedValue(mockCompletion)

      const originalTranscript = 'Original transcript'
      const result = await groqClient.adjustTranscript(originalTranscript)

      expect(result).toBe('Adjusted transcript content')
      expect(mockGroqClient.chat.completions.create).toHaveBeenCalledWith({
        messages: [
          {
            role: 'system',
            content:
              'You are a dictation assistant named Ito. Your job is to fulfill the intent of the transcript without asking follow up questions.',
          },
          {
            role: 'user',
            content: `Please fulfill this request: "${originalTranscript}"`,
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
      })
    })

    it('should return original transcript on LLM error', async () => {
      const mockError = new Error('LLM API error')
      mockGroqClient.chat.completions.create.mockRejectedValue(mockError)

      const originalTranscript = 'Original transcript'
      const result = await groqClient.adjustTranscript(originalTranscript)

      expect(result).toBe(originalTranscript)
    })

    it('should handle empty LLM response', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      }
      mockGroqClient.chat.completions.create.mockResolvedValue(mockCompletion)

      const originalTranscript = 'Original transcript'
      const result = await groqClient.adjustTranscript(originalTranscript)

      expect(result).toBe(originalTranscript)
    })
  })
})
