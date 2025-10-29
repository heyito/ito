import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock the text-writer module
const mockSetFocusedText = mock(() => Promise.resolve(true))
mock.module('../../media/text-writer', () => ({
  setFocusedText: mockSetFocusedText,
}))

import { TextInserter } from './TextInserter'

describe('TextInserter', () => {
  let textInserter: TextInserter

  beforeEach(() => {
    textInserter = new TextInserter()
    mockSetFocusedText.mockClear()

    // Reset default mock behavior
    mockSetFocusedText.mockResolvedValue(true)
  })

  describe('Text Insertion', () => {
    test('should insert text successfully', async () => {
      const transcript = 'Hello world'
      const result = await textInserter.insertText(transcript)

      expect(result).toBe(true)
      expect(mockSetFocusedText).toHaveBeenCalledWith(transcript)
    })

    test('should return false for empty transcript', async () => {
      const result = await textInserter.insertText('')

      expect(result).toBe(false)
      expect(mockSetFocusedText).not.toHaveBeenCalled()
    })

    test('should return false for transcript of whitespace', async () => {
      let result = await textInserter.insertText(' ')
      expect(result).toBe(false)
      expect(mockSetFocusedText).not.toHaveBeenCalled()

      result = await textInserter.insertText('\n')
      expect(result).toBe(false)
      expect(mockSetFocusedText).not.toHaveBeenCalled()
    })

    test('should return false for null transcript', async () => {
      const result = await textInserter.insertText(null as any)

      expect(result).toBe(false)
      expect(mockSetFocusedText).not.toHaveBeenCalled()
    })

    test('should return false for undefined transcript', async () => {
      const result = await textInserter.insertText(undefined as any)

      expect(result).toBe(false)
      expect(mockSetFocusedText).not.toHaveBeenCalled()
    })

    test('should handle different transcript types', async () => {
      const transcripts = [
        'Short text',
        'This is a longer transcript with multiple words and punctuation.',
        'Special characters: !@#$%^&*()',
        'Numbers: 123 456 789',
        'Mixed: Hello 123 World!',
      ]

      for (const transcript of transcripts) {
        const result = await textInserter.insertText(transcript)
        expect(result).toBe(true)
        expect(mockSetFocusedText).toHaveBeenCalledWith(transcript)
      }

      expect(mockSetFocusedText).toHaveBeenCalledTimes(transcripts.length)
    })
  })

  describe('Error Handling', () => {
    test('should handle setFocusedText returning false', async () => {
      mockSetFocusedText.mockResolvedValue(false)

      const result = await textInserter.insertText('test')

      expect(result).toBe(false)
      expect(mockSetFocusedText).toHaveBeenCalledWith('test')
    })

    test('should handle setFocusedText throwing error', async () => {
      const testError = new Error('Text insertion failed')
      mockSetFocusedText.mockRejectedValue(testError)

      const result = await textInserter.insertText('test')

      expect(result).toBe(false)
      expect(mockSetFocusedText).toHaveBeenCalledWith('test')
    })

    test('should handle setFocusedText throwing non-Error object', async () => {
      mockSetFocusedText.mockRejectedValue('String error')

      const result = await textInserter.insertText('test')

      expect(result).toBe(false)
    })
  })

  describe('Integration Scenarios', () => {
    test('should handle multiple sequential insertions', async () => {
      const transcripts = ['First', 'Second', 'Third']

      for (const transcript of transcripts) {
        const result = await textInserter.insertText(transcript)
        expect(result).toBe(true)
      }

      expect(mockSetFocusedText).toHaveBeenCalledTimes(3)
    })

    test('should handle mixed success and failure scenarios', async () => {
      // First call succeeds
      mockSetFocusedText.mockResolvedValueOnce(true)
      const result1 = await textInserter.insertText('Success')
      expect(result1).toBe(true)

      // Second call fails
      mockSetFocusedText.mockResolvedValueOnce(false)
      const result2 = await textInserter.insertText('Failure')
      expect(result2).toBe(false)

      // Third call throws error
      mockSetFocusedText.mockRejectedValueOnce(new Error('Error case'))
      const result3 = await textInserter.insertText('Error')
      expect(result3).toBe(false)

      expect(mockSetFocusedText).toHaveBeenCalledTimes(3)
    })
  })
})
