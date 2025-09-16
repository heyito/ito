import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock the text-writer module
const mockSetFocusedText = mock(() => Promise.resolve(true))
mock.module('../../media/text-writer', () => ({
  setFocusedText: mockSetFocusedText,
}))

// Mock the traceLogger
const mockTraceLogger = {
  logStep: mock(),
  logError: mock(),
}
mock.module('../traceLogger', () => ({
  traceLogger: mockTraceLogger,
}))

import { TextInserter } from './TextInserter'

describe('TextInserter', () => {
  let textInserter: TextInserter

  beforeEach(() => {
    textInserter = new TextInserter()
    mockSetFocusedText.mockClear()
    mockTraceLogger.logStep.mockClear()
    mockTraceLogger.logError.mockClear()

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

  describe('Logging with Interaction ID', () => {
    test('should log successful text insertion', async () => {
      const transcript = 'Hello world'
      const interactionId = 'test-interaction-123'

      const result = await textInserter.insertText(transcript, interactionId)

      expect(result).toBe(true)
      expect(mockTraceLogger.logStep).toHaveBeenCalledWith(
        interactionId,
        'TEXT_INSERTION',
        {
          transcript,
          transcriptLength: transcript.length,
          success: true,
        },
      )
      expect(mockTraceLogger.logError).not.toHaveBeenCalled()
    })

    test('should log failed text insertion', async () => {
      mockSetFocusedText.mockResolvedValue(false)
      const transcript = 'Test text'
      const interactionId = 'test-interaction-456'

      const result = await textInserter.insertText(transcript, interactionId)

      expect(result).toBe(false)
      expect(mockTraceLogger.logStep).toHaveBeenCalledWith(
        interactionId,
        'TEXT_INSERTION',
        {
          transcript,
          transcriptLength: transcript.length,
          success: false,
        },
      )
      expect(mockTraceLogger.logError).not.toHaveBeenCalled()
    })

    test('should log error when exception occurs', async () => {
      const testError = new Error('Text insertion failed')
      mockSetFocusedText.mockRejectedValue(testError)
      const transcript = 'Test text'
      const interactionId = 'test-interaction-error'

      const result = await textInserter.insertText(transcript, interactionId)

      expect(result).toBe(false)
      expect(mockTraceLogger.logError).toHaveBeenCalledWith(
        interactionId,
        'TEXT_INSERTION_ERROR',
        testError.message,
      )
      expect(mockTraceLogger.logStep).not.toHaveBeenCalled()
    })

    test('should log error with string error message', async () => {
      mockSetFocusedText.mockRejectedValue('String error message')
      const transcript = 'Test text'
      const interactionId = 'test-interaction-string-error'

      const result = await textInserter.insertText(transcript, interactionId)

      expect(result).toBe(false)
      expect(mockTraceLogger.logError).toHaveBeenCalledWith(
        interactionId,
        'TEXT_INSERTION_ERROR',
        'String error message',
      )
    })

    test('should not log when no interaction ID provided', async () => {
      const transcript = 'Hello world'

      const result = await textInserter.insertText(transcript)

      expect(result).toBe(true)
      expect(mockTraceLogger.logStep).not.toHaveBeenCalled()
      expect(mockTraceLogger.logError).not.toHaveBeenCalled()
    })

    test('should not log when empty transcript and no interaction ID', async () => {
      const result = await textInserter.insertText('')

      expect(result).toBe(false)
      expect(mockTraceLogger.logStep).not.toHaveBeenCalled()
      expect(mockTraceLogger.logError).not.toHaveBeenCalled()
    })
  })

  describe('Transcript Length Logging', () => {
    test('should log correct transcript length for various inputs', async () => {
      const testCases = [
        { transcript: 'Hi', expectedLength: 2 },
        { transcript: 'Hello world', expectedLength: 11 },
        { transcript: 'This is a longer message with more content', expectedLength: 42 },
        { transcript: '123!@#', expectedLength: 6 },
        { transcript: 'Multi\nline\ntext', expectedLength: 15 },
      ]

      for (let i = 0; i < testCases.length; i++) {
        const { transcript, expectedLength } = testCases[i]
        const interactionId = `test-${expectedLength}`
        await textInserter.insertText(transcript, interactionId)
      }

      // Check that all calls were made with correct parameters
      expect(mockTraceLogger.logStep).toHaveBeenCalledTimes(testCases.length)

      for (let i = 0; i < testCases.length; i++) {
        const { expectedLength } = testCases[i]
        const interactionId = `test-${expectedLength}`
        expect(mockTraceLogger.logStep).toHaveBeenNthCalledWith(
          i + 1,
          interactionId,
          'TEXT_INSERTION',
          expect.objectContaining({
            transcriptLength: expectedLength,
          }),
        )
      }
    })
  })

  describe('Integration Scenarios', () => {
    test('should handle multiple sequential insertions', async () => {
      const transcripts = ['First', 'Second', 'Third']
      const interactionId = 'multi-insert-test'

      for (const transcript of transcripts) {
        const result = await textInserter.insertText(transcript, interactionId)
        expect(result).toBe(true)
      }

      expect(mockSetFocusedText).toHaveBeenCalledTimes(3)
      expect(mockTraceLogger.logStep).toHaveBeenCalledTimes(3)
    })

    test('should handle mixed success and failure scenarios', async () => {
      const interactionId = 'mixed-results-test'

      // First call succeeds
      mockSetFocusedText.mockResolvedValueOnce(true)
      const result1 = await textInserter.insertText('Success', interactionId)
      expect(result1).toBe(true)

      // Second call fails
      mockSetFocusedText.mockResolvedValueOnce(false)
      const result2 = await textInserter.insertText('Failure', interactionId)
      expect(result2).toBe(false)

      // Third call throws error
      mockSetFocusedText.mockRejectedValueOnce(new Error('Error case'))
      const result3 = await textInserter.insertText('Error', interactionId)
      expect(result3).toBe(false)

      expect(mockSetFocusedText).toHaveBeenCalledTimes(3)
      expect(mockTraceLogger.logStep).toHaveBeenCalledTimes(2) // Success and failure
      expect(mockTraceLogger.logError).toHaveBeenCalledTimes(1) // Error case
    })
  })
})