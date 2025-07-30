import { describe, it, expect } from 'bun:test'
import {
  AsrModelSchema,
  VocabularySchema,
  VocabularyWordSchema,
} from './schemas.js'

describe('AsrModelSchema', () => {
  it('should accept valid ASR model names', () => {
    expect(AsrModelSchema.parse('whisper-large-v3')).toBe('whisper-large-v3')
    expect(AsrModelSchema.parse('distil-whisper-large-v3-en')).toBe(
      'distil-whisper-large-v3-en',
    )
    expect(AsrModelSchema.parse('custom-model-v1.2')).toBe('custom-model-v1.2')
  })

  it('should trim whitespace', () => {
    expect(AsrModelSchema.parse('  whisper-large-v3  ')).toBe(
      'whisper-large-v3',
    )
  })

  it('should throw for undefined input', () => {
    expect(() => AsrModelSchema.parse(undefined)).toThrow()
  })

  it('should reject empty strings', () => {
    expect(() => AsrModelSchema.parse('')).toThrow('ASR model cannot be empty')
  })

  it('should reject models that are too long', () => {
    const longModel = 'a'.repeat(101)
    expect(() => AsrModelSchema.parse(longModel)).toThrow('ASR model too long')
  })

  it('should reject models with invalid characters', () => {
    expect(() => AsrModelSchema.parse('model<script>')).toThrow(
      'ASR model contains invalid characters',
    )
    expect(() => AsrModelSchema.parse('model with spaces')).toThrow(
      'ASR model contains invalid characters',
    )
    expect(() => AsrModelSchema.parse('model&dangerous')).toThrow(
      'ASR model contains invalid characters',
    )
  })

  it('should accept models with valid characters', () => {
    expect(AsrModelSchema.parse('model-name')).toBe('model-name')
    expect(AsrModelSchema.parse('model_name')).toBe('model_name')
    expect(AsrModelSchema.parse('model.name')).toBe('model.name')
    expect(AsrModelSchema.parse('model123')).toBe('model123')
  })
})

describe('VocabularyWordSchema', () => {
  it('should accept valid vocabulary words', () => {
    expect(VocabularyWordSchema.parse('hello')).toBe('hello')
    expect(VocabularyWordSchema.parse('world-123')).toBe('world-123')
    expect(VocabularyWordSchema.parse("it's")).toBe("it's")
    expect(VocabularyWordSchema.parse('multi word')).toBe('multi word')
  })

  it('should trim whitespace', () => {
    expect(VocabularyWordSchema.parse('  hello  ')).toBe('hello')
  })

  it('should reject empty words', () => {
    expect(() => VocabularyWordSchema.parse('')).toThrow()
    expect(() => VocabularyWordSchema.parse('   ')).toThrow()
  })

  it('should reject words that are too long', () => {
    const longWord = 'a'.repeat(101)
    expect(() => VocabularyWordSchema.parse(longWord)).toThrow()
  })

  it('should reject words with invalid characters', () => {
    expect(() => VocabularyWordSchema.parse('word<script>')).toThrow()
    expect(() => VocabularyWordSchema.parse('word&dangerous')).toThrow()
  })
})

describe('VocabularySchema', () => {
  it('should parse comma-separated vocabulary list', () => {
    const result = VocabularySchema.parse('hello,world,test')
    expect(result).toEqual(['hello', 'world', 'test'])
  })

  it('should handle empty input', () => {
    expect(VocabularySchema.parse('')).toEqual([])
  })

  it('should throw for undefined input', () => {
    expect(() => VocabularySchema.parse(undefined)).toThrow()
  })

  it('should trim individual words', () => {
    const result = VocabularySchema.parse('  hello  ,  world  ,  test  ')
    expect(result).toEqual(['hello', 'world', 'test'])
  })

  it('should filter out empty words', () => {
    const result = VocabularySchema.parse('hello,,world,  ,test')
    expect(result).toEqual(['hello', 'world', 'test'])
  })

  it('should limit to 500 words', () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(',')
    const result = VocabularySchema.parse(words)
    expect(result).toHaveLength(500)
  })

  it('should reject if total string is too long', () => {
    const longString = 'a'.repeat(5001)
    expect(() => VocabularySchema.parse(longString)).toThrow(
      'Vocabulary list too long',
    )
  })

  it('should filter out invalid words', () => {
    const result = VocabularySchema.parse(
      'hello,<script>,world,valid&word,test',
    )
    expect(result).toEqual(['hello', 'world', 'test'])
  })

  it('should handle mixed valid and invalid words', () => {
    const result = VocabularySchema.parse(
      'valid1,invalid<>,valid2,too-long-' + 'a'.repeat(100),
    )
    expect(result).toEqual(['valid1', 'valid2'])
  })
})
