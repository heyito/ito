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
})
