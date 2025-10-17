import { describe, it, expect } from 'bun:test'
import { ConnectError } from '@connectrpc/connect'
import { HeaderValidator } from './HeaderValidator.js'

describe('HeaderValidator', () => {
  describe('validateAsrModel', () => {
    it('should return valid ASR model names', () => {
      expect(HeaderValidator.validateAsrModel('whisper-large-v3')).toBe(
        'whisper-large-v3',
      )
      expect(
        HeaderValidator.validateAsrModel('distil-whisper-large-v3-en'),
      ).toBe('distil-whisper-large-v3-en')
    })

    it('should trim whitespace from ASR models', () => {
      expect(HeaderValidator.validateAsrModel('  whisper-large-v3  ')).toBe(
        'whisper-large-v3',
      )
    })

    it('should handle custom model names', () => {
      expect(HeaderValidator.validateAsrModel('custom-model-v1.0')).toBe(
        'custom-model-v1.0',
      )
    })

    it('should throw ConnectError for invalid ASR models', () => {
      expect(() => HeaderValidator.validateAsrModel('invalid<model>')).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateAsrModel('')).toThrow(ConnectError)
      expect(() =>
        HeaderValidator.validateAsrModel('model with spaces'),
      ).toThrow(ConnectError)
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateAsrModel(null as any)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateAsrModel(undefined as any)).toThrow(
        ConnectError,
      )
    })

    it('should reject models that are too long', () => {
      const longModel = 'a'.repeat(101)
      expect(() => HeaderValidator.validateAsrModel(longModel)).toThrow()
    })
  })

  describe('validateVocabulary', () => {
    it('should return array of valid vocabulary words', () => {
      const result = HeaderValidator.validateVocabulary('hello,world,test')
      expect(result).toEqual(['hello', 'world', 'test'])
    })

    it('should handle empty input', () => {
      expect(HeaderValidator.validateVocabulary('')).toEqual([])
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateVocabulary(null as any)).toThrow(
        ConnectError,
      )
      expect(() =>
        HeaderValidator.validateVocabulary(undefined as any),
      ).toThrow(ConnectError)
    })

    it('should trim individual words', () => {
      const result = HeaderValidator.validateVocabulary('  hello  ,  world  ')
      expect(result).toEqual(['hello', 'world'])
    })

    it('should filter out empty words', () => {
      const result = HeaderValidator.validateVocabulary('hello,,world,  ,test')
      expect(result).toEqual(['hello', 'world', 'test'])
    })

    it('should handle words with apostrophes', () => {
      const result = HeaderValidator.validateVocabulary("it's,won't,can't")
      expect(result).toEqual(["it's", "won't", "can't"])
    })

    it('should throw ConnectError for invalid vocabulary', () => {
      // Test with vocabulary that's too long
      const longVocab = 'a'.repeat(5001)
      expect(() => HeaderValidator.validateVocabulary(longVocab)).toThrow(
        ConnectError,
      )
    })

    it('should filter out words with invalid characters', () => {
      const result = HeaderValidator.validateVocabulary(
        'valid,<script>,another,invalid&word',
      )
      expect(result).toEqual(['valid', 'another'])
    })

    it('should limit to 500 words', () => {
      const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(',')
      const result = HeaderValidator.validateVocabulary(words)
      expect(result).toHaveLength(500)
    })

    it('should filter out words that are too long', () => {
      const longWord = 'a'.repeat(101)
      const result = HeaderValidator.validateVocabulary(
        `valid,${longWord},another`,
      )
      expect(result).toEqual(['valid', 'another'])
    })
  })

  describe('validateAsrProvider', () => {
    it('should return valid ASR provider names', () => {
      expect(HeaderValidator.validateAsrProvider('groq')).toBe('groq')
    })

    it('should trim whitespace from ASR providers', () => {
      expect(HeaderValidator.validateAsrProvider('  groq  ')).toBe('groq')
    })

    it('should throw ConnectError for invalid ASR providers', () => {
      expect(() =>
        HeaderValidator.validateAsrProvider('invalid-provider'),
      ).toThrow(ConnectError)
      expect(() => HeaderValidator.validateAsrProvider('')).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateAsrProvider('openai')).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateAsrProvider(null as any)).toThrow(
        ConnectError,
      )
      expect(() =>
        HeaderValidator.validateAsrProvider(undefined as any),
      ).toThrow(ConnectError)
    })
  })

  describe('validateAsrPrompt', () => {
    it('should return valid ASR prompt', () => {
      expect(HeaderValidator.validateAsrPrompt('transcribe this audio')).toBe(
        'transcribe this audio',
      )
    })

    it('should trim whitespace from ASR prompt', () => {
      expect(HeaderValidator.validateAsrPrompt('  transcribe this  ')).toBe(
        'transcribe this',
      )
    })

    it('should handle empty prompt', () => {
      expect(HeaderValidator.validateAsrPrompt('')).toBe('')
    })

    it('should throw ConnectError for prompts that are too long', () => {
      const longPrompt = 'a'.repeat(101)
      expect(() => HeaderValidator.validateAsrPrompt(longPrompt)).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateAsrPrompt(null as any)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateAsrPrompt(undefined as any)).toThrow(
        ConnectError,
      )
    })
  })

  describe('validateLlmProvider', () => {
    it('should return valid LLM provider names', () => {
      expect(HeaderValidator.validateLlmProvider('groq')).toBe('groq')
    })

    it('should trim whitespace from LLM providers', () => {
      expect(HeaderValidator.validateLlmProvider('  groq  ')).toBe('groq')
    })

    it('should throw ConnectError for invalid LLM providers', () => {
      expect(() =>
        HeaderValidator.validateLlmProvider('invalid-provider'),
      ).toThrow(ConnectError)
      expect(() => HeaderValidator.validateLlmProvider('')).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateLlmProvider('openai')).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateLlmProvider(null as any)).toThrow(
        ConnectError,
      )
      expect(() =>
        HeaderValidator.validateLlmProvider(undefined as any),
      ).toThrow(ConnectError)
    })
  })

  describe('validateLlmModel', () => {
    it('should return valid LLM model names', () => {
      expect(HeaderValidator.validateLlmModel('gpt-4o')).toBe('gpt-4o')
      expect(HeaderValidator.validateLlmModel('llama-3.1-8b')).toBe(
        'llama-3.1-8b',
      )
    })

    it('should trim whitespace from LLM models', () => {
      expect(HeaderValidator.validateLlmModel('  gpt-4o  ')).toBe('gpt-4o')
    })

    it('should handle custom model names', () => {
      expect(HeaderValidator.validateLlmModel('custom-model-v2.0')).toBe(
        'custom-model-v2.0',
      )
    })

    it('should throw ConnectError for invalid LLM models', () => {
      expect(() => HeaderValidator.validateLlmModel('invalid<model>')).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateLlmModel('')).toThrow(ConnectError)
      expect(() =>
        HeaderValidator.validateLlmModel('model with spaces'),
      ).toThrow(ConnectError)
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateLlmModel(null as any)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateLlmModel(undefined as any)).toThrow(
        ConnectError,
      )
    })

    it('should reject models that are too long', () => {
      const longModel = 'a'.repeat(101)
      expect(() => HeaderValidator.validateLlmModel(longModel)).toThrow(
        ConnectError,
      )
    })
  })

  describe('validateLlmTemperature', () => {
    it('should return valid temperature values', () => {
      expect(HeaderValidator.validateLlmTemperature(0)).toBe(0)
      expect(HeaderValidator.validateLlmTemperature(1)).toBe(1)
      expect(HeaderValidator.validateLlmTemperature(2)).toBe(2)
      expect(HeaderValidator.validateLlmTemperature(0.5)).toBe(0.5)
    })

    it('should throw ConnectError for temperature below 0', () => {
      expect(() => HeaderValidator.validateLlmTemperature(-0.1)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateLlmTemperature(-1)).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for temperature above 2', () => {
      expect(() => HeaderValidator.validateLlmTemperature(2.1)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateLlmTemperature(3)).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateLlmTemperature(null as any)).toThrow(
        ConnectError,
      )
      expect(() =>
        HeaderValidator.validateLlmTemperature(undefined as any),
      ).toThrow(ConnectError)
    })
  })

  describe('validateTranscriptionPrompt', () => {
    it('should return valid transcription prompt', () => {
      expect(
        HeaderValidator.validateTranscriptionPrompt('transcribe this'),
      ).toBe('transcribe this')
    })

    it('should trim whitespace from transcription prompt', () => {
      expect(
        HeaderValidator.validateTranscriptionPrompt('  transcribe this  '),
      ).toBe('transcribe this')
    })

    it('should handle empty prompt', () => {
      expect(HeaderValidator.validateTranscriptionPrompt('')).toBe('')
    })

    it('should throw ConnectError for prompts that are too long', () => {
      const longPrompt = 'a'.repeat(1501)
      expect(() =>
        HeaderValidator.validateTranscriptionPrompt(longPrompt),
      ).toThrow(ConnectError)
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() =>
        HeaderValidator.validateTranscriptionPrompt(null as any),
      ).toThrow(ConnectError)
      expect(() =>
        HeaderValidator.validateTranscriptionPrompt(undefined as any),
      ).toThrow(ConnectError)
    })
  })

  describe('validateEditingPrompt', () => {
    it('should return valid editing prompt', () => {
      expect(HeaderValidator.validateEditingPrompt('edit this text')).toBe(
        'edit this text',
      )
    })

    it('should trim whitespace from editing prompt', () => {
      expect(HeaderValidator.validateEditingPrompt('  edit this  ')).toBe(
        'edit this',
      )
    })

    it('should handle empty prompt', () => {
      expect(HeaderValidator.validateEditingPrompt('')).toBe('')
    })

    it('should throw ConnectError for prompts that are too long', () => {
      const longPrompt = 'a'.repeat(1501)
      expect(() => HeaderValidator.validateEditingPrompt(longPrompt)).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() => HeaderValidator.validateEditingPrompt(null as any)).toThrow(
        ConnectError,
      )
      expect(() =>
        HeaderValidator.validateEditingPrompt(undefined as any),
      ).toThrow(ConnectError)
    })
  })

  describe('validateNoSpeechThreshold', () => {
    it('should return valid no speech threshold values', () => {
      expect(HeaderValidator.validateNoSpeechThreshold(0)).toBe(0)
      expect(HeaderValidator.validateNoSpeechThreshold(1)).toBe(1)
      expect(HeaderValidator.validateNoSpeechThreshold(0.5)).toBe(0.5)
    })

    it('should throw ConnectError for threshold below 0', () => {
      expect(() => HeaderValidator.validateNoSpeechThreshold(-0.1)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateNoSpeechThreshold(-1)).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for threshold above 1', () => {
      expect(() => HeaderValidator.validateNoSpeechThreshold(1.1)).toThrow(
        ConnectError,
      )
      expect(() => HeaderValidator.validateNoSpeechThreshold(2)).toThrow(
        ConnectError,
      )
    })

    it('should throw ConnectError for null and undefined inputs', () => {
      expect(() =>
        HeaderValidator.validateNoSpeechThreshold(null as any),
      ).toThrow(ConnectError)
      expect(() =>
        HeaderValidator.validateNoSpeechThreshold(undefined as any),
      ).toThrow(ConnectError)
    })
  })
})
