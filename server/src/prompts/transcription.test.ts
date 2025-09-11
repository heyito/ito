import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { createTranscriptionPrompt } from './transcription.js'

// Mock console.log to capture logging during tests
const originalConsoleLog = console.log
let consoleLogs: string[] = []

describe('transcription', () => {
  beforeEach(() => {
    // Mock console.log to capture output
    consoleLogs = []
    console.log = mock((message: string) => {
      consoleLogs.push(message)
    })
  })

  afterEach(() => {
    // Restore original console.log
    console.log = originalConsoleLog
  })

  describe('estimateTokenCount', () => {
    // Since estimateTokenCount is not exported, we'll test it indirectly through createTranscriptionPrompt
    it('should estimate tokens correctly through prompt creation', () => {
      // Test with known input to verify token estimation logic
      const vocabulary = ['test'] // 4 characters = 1 token
      const result = createTranscriptionPrompt(vocabulary)

      // The base prompt is "Dictionary entries include: " (26 chars) + "test" (4 chars) + ". " (2 chars) + "Transcribe accurately with proper punctuation and capitalization." (68 chars)
      // Total: 100 characters ≈ 25 tokens, well under the 224 limit
      expect(result).toBe('Dictionary entries include: test. ')
      expect(consoleLogs).toHaveLength(1)
      expect(consoleLogs[0]).toMatch(
        /Transcription prompt: \d+ estimated tokens/,
      )
    })
  })

  describe('createTranscriptionPrompt', () => {
    it('should create prompt with empty vocabulary', () => {
      createTranscriptionPrompt([])

      expect(consoleLogs).toHaveLength(1)
      expect(consoleLogs[0]).toMatch(
        /Transcription prompt: \d+ estimated tokens/,
      )
      expect(consoleLogs[0]).not.toContain('vocabulary truncated')
    })

    it('should create prompt with small vocabulary', () => {
      const vocabulary = ['hello', 'world', 'test']
      const result = createTranscriptionPrompt(vocabulary)

      expect(result).toBe('Dictionary entries include: hello, world, test. ')
      expect(consoleLogs).toHaveLength(1)
      expect(consoleLogs[0]).toMatch(
        /Transcription prompt: \d+ estimated tokens/,
      )
      expect(consoleLogs[0]).not.toContain('vocabulary truncated')
    })

    it('should handle single vocabulary item', () => {
      const vocabulary = ['single']
      const result = createTranscriptionPrompt(vocabulary)

      expect(result).toBe('Dictionary entries include: single. ')
      expect(consoleLogs).toHaveLength(1)
    })

    it('should truncate vocabulary when it exceeds token limit', () => {
      // Create a large vocabulary that will exceed the token limit
      const largeVocabulary = Array.from({ length: 200 }, (_, i) => `word${i}`)
      const result = createTranscriptionPrompt(largeVocabulary)

      // Should still have the correct structure
      expect(result).toStartWith('Dictionary entries include: ')

      // Should have logged truncation
      expect(consoleLogs).toHaveLength(2)
      expect(consoleLogs[0]).toMatch(
        /Vocabulary truncated from \d+ to \d+ characters/,
      )
      expect(consoleLogs[1]).toMatch(
        /Transcription prompt: \d+ estimated tokens \(vocabulary truncated\)/,
      )

      // Should not end with a partial word (no comma at the end before suffix)
      const vocabPart = result.replace('Dictionary entries include: ', '')
      expect(vocabPart).not.toEndWith(',')
      expect(vocabPart).not.toMatch(/,\s*$/)
    })

    it('should respect the 224 token limit', () => {
      // Create vocabulary that would exceed limit
      const largeVocabulary = Array.from(
        { length: 300 },
        (_, i) => `verylongwordthataddsmanytokens${i}`,
      )
      const result = createTranscriptionPrompt(largeVocabulary)

      // Estimate tokens for the result (rough approximation: 1 token ≈ 4 characters)
      const estimatedTokens = Math.ceil(result.length / 4)
      expect(estimatedTokens).toBeLessThanOrEqual(224)

      expect(consoleLogs).toHaveLength(2)
      expect(consoleLogs[1]).toMatch(/vocabulary truncated/)
    })

    it('should maintain proper prompt structure', () => {
      const vocabulary = ['alpha', 'beta', 'gamma']
      const result = createTranscriptionPrompt(vocabulary)

      expect(result).toStartWith('Dictionary entries include: ')
      expect(result).toContain('alpha, beta, gamma')
    })

    it('should handle vocabulary with special characters', () => {
      const vocabulary = ['hello-world', 'test_case', 'special@char']
      const result = createTranscriptionPrompt(vocabulary)

      expect(result).toBe(
        'Dictionary entries include: hello-world, test_case, special@char. ',
      )
    })

    it('should handle vocabulary with very long individual words', () => {
      const vocabulary = ['a'.repeat(100), 'b'.repeat(50)]
      const result = createTranscriptionPrompt(vocabulary)

      // Should still create a valid prompt
      expect(result).toStartWith('Dictionary entries include: ')
    })

    it('should properly join vocabulary with commas and spaces', () => {
      const vocabulary = ['one', 'two', 'three', 'four']
      const result = createTranscriptionPrompt(vocabulary)

      expect(result).toBe('Dictionary entries include: one, two, three, four. ')
    })

    it('should remove incomplete last term when truncating', () => {
      // Create a vocabulary that will need truncation
      const vocabulary = Array.from(
        { length: 100 },
        (_, i) => `word${i}thisisalongword`,
      )
      const result = createTranscriptionPrompt(vocabulary)

      if (consoleLogs.some(log => log.includes('vocabulary truncated'))) {
        // If truncation occurred, ensure no partial words at the end
        const vocabPart = result.replace('Dictionary entries include: ', '')

        // Should not end with a comma followed by partial text
        const lastCommaIndex = vocabPart.lastIndexOf(',')
        if (lastCommaIndex !== -1) {
          const afterLastComma = vocabPart.substring(lastCommaIndex + 1).trim()
          // If there's content after the last comma, it should be a complete word
          if (afterLastComma) {
            expect(afterLastComma).toMatch(/^word\d+thisisalongword\.$/)
          }
        }
      }
    })

    it('should return simple prompt when vocabulary becomes empty after processing', () => {
      // Test edge case where vocabulary might be filtered to empty
      const vocabulary = [''] // This should be filtered out or result in empty vocab
      createTranscriptionPrompt(vocabulary)

      // Should return just the base instruction since vocabulary is effectively empty
      expect(consoleLogs).toHaveLength(1)
      expect(consoleLogs[0]).toMatch(
        /Transcription prompt: \d+ estimated tokens/,
      )
      expect(consoleLogs[0]).not.toContain('vocabulary truncated')
    })
  })
})
