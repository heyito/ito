import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'
import { ItoMode } from '../generated/ito_pb.js'

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
const { groqClient, itoVocabulary } = await import('./groqClient.js')
const { createTranscriptionPrompt } = await import(
  '../prompts/transcription.js'
)

describe('GroqClient', () => {
  const NO_SPEECH_THRESHOLD = 0.6
  const LOW_QUALITY_THRESHOLD = -0.5
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
      const transcriptionPrompt = createTranscriptionPrompt([
        ...itoVocabulary,
        ...vocabulary,
      ])

      const result = await groqClient.transcribeAudio(audioBuffer, {
        fileType: 'wav',
        asrModel,
        noSpeechThreshold: NO_SPEECH_THRESHOLD,
        lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        vocabulary,
      })

      expect(result).toBe('Hello world')
      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.wav',
        }),
        model: asrModel,
        prompt: transcriptionPrompt,
        response_format: 'verbose_json',
      })
    })

    it('should use default file type when not specified', async () => {
      const mockTranscription = { text: 'Test transcription' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'distil-whisper-large-v3-en'
      const transcriptionPrompt = createTranscriptionPrompt(itoVocabulary)

      await groqClient.transcribeAudio(audioBuffer, {
        asrModel,
        noSpeechThreshold: NO_SPEECH_THRESHOLD,
        lowQualityThreshold: LOW_QUALITY_THRESHOLD,
      })

      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.webm',
        }),
        model: asrModel,
        prompt: transcriptionPrompt,
        response_format: 'verbose_json',
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
      const transcriptionPrompt = createTranscriptionPrompt([
        ...itoVocabulary,
        ...vocabulary,
      ])

      await groqClient.transcribeAudio(audioBuffer, {
        fileType: 'wav',
        asrModel,
        noSpeechThreshold: NO_SPEECH_THRESHOLD,
        lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        vocabulary,
      })

      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.wav',
        }),
        model: asrModel,
        prompt: transcriptionPrompt,
        response_format: 'verbose_json',
      })
    })

    it('should handle empty vocabulary', async () => {
      const mockTranscription = { text: 'No vocabulary' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'
      const transcriptionPrompt = createTranscriptionPrompt(itoVocabulary)

      await groqClient.transcribeAudio(audioBuffer, {
        fileType: 'wav',
        asrModel,
        noSpeechThreshold: NO_SPEECH_THRESHOLD,
        lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        vocabulary: [],
      })

      expect(mockGroqClient.audio.transcriptions.create).toHaveBeenCalledWith({
        file: expect.objectContaining({
          filename: 'audio.wav',
        }),
        model: asrModel,
        prompt: transcriptionPrompt,
        response_format: 'verbose_json',
      })
    })

    it('should throw error when ASR model is not provided', async () => {
      const audioBuffer = Buffer.from('mock audio data')

      await expect(
        groqClient.transcribeAudio(audioBuffer, {
          fileType: 'wav',
          asrModel: '',
          noSpeechThreshold: NO_SPEECH_THRESHOLD,
          lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        }),
      ).rejects.toThrow('ASR model is required for transcription.')
    })

    it('should trim whitespace from transcription result', async () => {
      const mockTranscription = { text: '  Hello world  ' }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      const result = await groqClient.transcribeAudio(audioBuffer, {
        fileType: 'wav',
        asrModel,
        noSpeechThreshold: NO_SPEECH_THRESHOLD,
        lowQualityThreshold: LOW_QUALITY_THRESHOLD,
      })

      expect(result).toBe('Hello world')
    })

    it('should throw when low quality transcription', async () => {
      const mockTranscription = {
        text: 'Low quality transcription',
        segments: [{ avg_logprob: LOW_QUALITY_THRESHOLD - 0.01 }],
      }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      await expect(
        groqClient.transcribeAudio(audioBuffer, {
          fileType: 'wav',
          asrModel,
          noSpeechThreshold: NO_SPEECH_THRESHOLD,
          lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        }),
      ).rejects.toThrow('Unable to transcribe audio.')
    })

    it('should throw when the transcript contains no speech', async () => {
      const mockTranscription = {
        text: '',
        segments: [{ no_speech_prob: NO_SPEECH_THRESHOLD + 0.01 }],
      }
      mockGroqClient.audio.transcriptions.create.mockResolvedValue(
        mockTranscription,
      )
      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      await expect(
        groqClient.transcribeAudio(audioBuffer, {
          fileType: 'wav',
          asrModel,
          noSpeechThreshold: NO_SPEECH_THRESHOLD,
          lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        }),
      ).rejects.toThrow('No speech detected')
    })

    it('should handle Groq API errors properly', async () => {
      const mockError = new Error('Groq API error')
      mockGroqClient.audio.transcriptions.create.mockRejectedValue(mockError)

      const audioBuffer = Buffer.from('mock audio data')
      const asrModel = 'whisper-large-v3'

      await expect(
        groqClient.transcribeAudio(audioBuffer, {
          fileType: 'wav',
          asrModel,
          noSpeechThreshold: NO_SPEECH_THRESHOLD,
          lowQualityThreshold: LOW_QUALITY_THRESHOLD,
        }),
      ).rejects.toThrow('Groq API error')
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
      const result = await groqClient.adjustTranscript(
        originalTranscript,
        ItoMode.TRANSCRIBE,
        undefined,
        {
          temperature: 0.1,
          model: 'llama-3.3-70b-versatile',
          prompt: 'You are a dictation assistant named Ito. Your job is to fulfill the intent of the transcript without asking follow up questions.',
        },
      )

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
            content: `The user's transcript: ${originalTranscript}`,
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
      const result = await groqClient.adjustTranscript(
        originalTranscript,
        ItoMode.TRANSCRIBE,
        undefined,
        {
          temperature: 0.1,
          model: 'llama-3.3-70b-versatile',
          prompt: 'You are a dictation assistant named Ito. Your job is to fulfill the intent of the transcript without asking follow up questions.',
        },
      )

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
      const result = await groqClient.adjustTranscript(
        originalTranscript,
        ItoMode.TRANSCRIBE,
        undefined,
        {
          temperature: 0.1,
          model: 'llama-3.3-70b-versatile',
          prompt: 'You are a dictation assistant named Ito. Your job is to fulfill the intent of the transcript without asking follow up questions.',
        },
      )

      expect(result).toBe(originalTranscript)
    })
  })
})
