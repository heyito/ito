import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock the database utilities
const mockRun = mock()
const mockGet = mock()
const mockAll = mock()

// Mock the utils module
mock.module('./utils', () => ({
  run: mockRun,
  get: mockGet,
  all: mockAll,
}))

import { InteractionsTable, NotesTable, DictionaryTable } from './repo'
import { resetSqliteMocks } from '../../__tests__/mocks/sqlite'
import {
  sampleInteraction,
  TEST_USER_ID,
} from '../../__tests__/fixtures/database'

// Mock uuid
mock.module('uuid', () => ({
  v4: mock(() => 'test-uuid-123'),
}))

describe('InteractionsTable - Business Logic', () => {
  beforeEach(() => {
    mockRun.mockClear()
    mockGet.mockClear()
    mockAll.mockClear()
    resetSqliteMocks()
  })

  describe('JSON field handling', () => {
    test('should handle complex JSON objects in asr_output and llm_output', async () => {
      const complexAsrOutput = {
        transcript: 'complex audio',
        words: [
          { text: 'complex', start: 0, end: 1, confidence: 0.95 },
          { text: 'audio', start: 1, end: 2, confidence: 0.88 },
        ],
        metadata: { sampleRate: 16000, channels: 1 },
      }

      const complexLlmOutput = {
        response: 'Complex response',
        confidence: 0.92,
        tokens: ['Complex', 'response'],
        model: 'test-model-v1',
      }

      const insertData = {
        user_id: TEST_USER_ID,
        title: 'Complex Interaction',
        asr_output: complexAsrOutput,
        llm_output: complexLlmOutput,
        raw_audio: null,
        duration_ms: 3000,
      }

      mockRun.mockResolvedValue(undefined)

      const result = await InteractionsTable.insert(insertData)

      expect(result.asr_output).toEqual(complexAsrOutput)
      expect(result.llm_output).toEqual(complexLlmOutput)

      // Verify JSON serialization in database call
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interactions'),
        expect.arrayContaining([
          expect.any(String),
          TEST_USER_ID,
          'Complex Interaction',
          JSON.stringify(complexAsrOutput),
          JSON.stringify(complexLlmOutput),
          null,
          3000,
          expect.any(String),
          expect.any(String),
          null,
        ]),
      )
    })

    test('should parse double-encoded JSON fields correctly', async () => {
      const originalData = { transcript: 'double encoded test' }
      const doubleEncodedAsr = JSON.stringify(JSON.stringify(originalData))

      const mockInteraction = {
        ...sampleInteraction,
        asr_output: doubleEncodedAsr,
        llm_output: JSON.stringify({ response: 'normal encoding' }),
      }

      mockGet.mockResolvedValue(mockInteraction)

      const result = await InteractionsTable.findById('interaction-1')

      expect(result!.asr_output).toEqual(originalData)
      expect(result!.llm_output).toEqual({ response: 'normal encoding' })
    })

    test('should handle malformed JSON gracefully and log errors', async () => {
      // Mock console.error to capture error logging
      const consoleSpy = mock()
      const originalError = console.error
      console.error = consoleSpy

      try {
        const mockInteraction = {
          ...sampleInteraction,
          asr_output: 'invalid json {',
          llm_output: JSON.stringify({ response: 'valid json' }),
        }

        mockGet.mockResolvedValue(mockInteraction)

        const result = await InteractionsTable.findById('interaction-1')

        // Should gracefully handle malformed JSON by returning null
        expect(result!.asr_output).toBeNull()
        expect(result!.llm_output).toEqual({ response: 'valid json' })

        // Should log the error
        expect(consoleSpy).toHaveBeenCalledWith(
          '[InteractionsTable] Failed to parse JSON field:',
          expect.any(Error),
        )
        expect(consoleSpy).toHaveBeenCalledTimes(1)
      } finally {
        console.error = originalError
      }
    })

    test('should handle null and non-string JSON fields', async () => {
      const mockInteraction = {
        ...sampleInteraction,
        asr_output: null,
        llm_output: undefined,
      }

      mockGet.mockResolvedValue(mockInteraction)

      const result = await InteractionsTable.findById('interaction-1')

      expect(result!.asr_output).toBeNull()
      expect(result!.llm_output).toBeUndefined()
    })

    test('should handle already parsed objects without re-parsing', async () => {
      const alreadyParsedObject = { transcript: 'already parsed' }

      const mockInteraction = {
        ...sampleInteraction,
        asr_output: alreadyParsedObject, // Not a string
        llm_output: JSON.stringify({ response: 'string to parse' }),
      }

      mockGet.mockResolvedValue(mockInteraction)

      const result = await InteractionsTable.findById('interaction-1')

      expect(result!.asr_output).toEqual(alreadyParsedObject)
      expect(result!.llm_output).toEqual({ response: 'string to parse' })
    })
  })

  describe('data transformation', () => {
    test('should generate UUID and timestamps for new interactions', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        title: 'Test Interaction',
        asr_output: { transcript: 'hello' },
        llm_output: { response: 'hi' },
        raw_audio: null,
        duration_ms: 1000,
      }

      mockRun.mockResolvedValue(undefined)

      const result = await InteractionsTable.insert(insertData)

      // Should add generated fields
      expect(result.id).toBe('test-uuid-123')
      expect(result.created_at).toBeDefined()
      expect(result.updated_at).toBeDefined()
      expect(result.deleted_at).toBeNull()

      // Should preserve input data
      expect(result.user_id).toBe(TEST_USER_ID)
      expect(result.title).toBe('Test Interaction')
      expect(result.asr_output).toEqual({ transcript: 'hello' })
      expect(result.llm_output).toEqual({ response: 'hi' })
    })

    test('should handle null values in insert data', async () => {
      const insertData = {
        user_id: null,
        title: 'Anonymous Interaction',
        asr_output: { transcript: 'anonymous' },
        llm_output: { response: 'Response' },
        raw_audio: null,
        duration_ms: null,
      }

      mockRun.mockResolvedValue(undefined)

      const result = await InteractionsTable.insert(insertData)

      expect(result.user_id).toBeNull()
      expect(result.raw_audio).toBeNull()
      expect(result.duration_ms).toBeNull()
      expect(result.id).toBeDefined()
      expect(result.created_at).toBeDefined()
    })
  })
})

describe('NotesTable - Business Logic', () => {
  beforeEach(() => {
    mockRun.mockClear()
    mockGet.mockClear()
    mockAll.mockClear()
  })

  describe('content handling', () => {
    test('should handle string content directly', async () => {
      mockRun.mockResolvedValue(undefined)

      await NotesTable.updateContent('note-1', 'Simple string content')

      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE notes SET content = ?, updated_at = ? WHERE id = ?',
        ['Simple string content', expect.any(String), 'note-1'],
      )
    })

    test('should stringify object content', async () => {
      mockRun.mockResolvedValue(undefined)
      const objectContent = {
        type: 'rich',
        text: 'Rich content',
        metadata: { author: 'user', version: 1 },
      }

      await NotesTable.updateContent('note-1', objectContent as any)

      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE notes SET content = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(objectContent), expect.any(String), 'note-1'],
      )
    })

    test('should handle array content by stringifying', async () => {
      mockRun.mockResolvedValue(undefined)
      const arrayContent = ['item1', 'item2', 'item3']

      await NotesTable.updateContent('note-1', arrayContent as any)

      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE notes SET content = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(arrayContent), expect.any(String), 'note-1'],
      )
    })

    test('should update timestamp when updating content', async () => {
      mockRun.mockResolvedValue(undefined)
      const beforeTime = Date.now()

      await NotesTable.updateContent('note-1', 'Updated content')

      const call = mockRun.mock.calls[0]
      const timestamp = call[1][1] // second parameter (updated_at)
      const afterTime = Date.now()

      // Verify timestamp is a valid ISO string within reasonable time range
      expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(beforeTime)
      expect(new Date(timestamp).getTime()).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('data transformation', () => {
    test('should generate UUID and timestamps for new notes', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        interaction_id: 'interaction-1',
        content: 'Test note content',
      }

      mockRun.mockResolvedValue(undefined)

      const result = await NotesTable.insert(insertData)

      expect(result.id).toBe('test-uuid-123')
      expect(result.created_at).toBeDefined()
      expect(result.updated_at).toBeDefined()
      expect(result.deleted_at).toBeNull()
      expect(result.user_id).toBe(TEST_USER_ID)
      expect(result.interaction_id).toBe('interaction-1')
      expect(result.content).toBe('Test note content')
    })
  })
})

describe('Timestamp Generation', () => {
  test('should generate valid ISO timestamps', async () => {
    const insertData = {
      user_id: TEST_USER_ID,
      title: 'Timestamp Test',
      asr_output: {},
      llm_output: {},
      raw_audio: null,
      duration_ms: null,
    }

    mockRun.mockResolvedValue(undefined)
    const beforeTime = Date.now()

    const result = await InteractionsTable.insert(insertData)

    const afterTime = Date.now()

    // Verify timestamps are valid ISO strings
    expect(() => new Date(result.created_at)).not.toThrow()
    expect(() => new Date(result.updated_at)).not.toThrow()

    // Verify timestamps are within reasonable time range
    const createdTime = new Date(result.created_at).getTime()
    const updatedTime = new Date(result.updated_at).getTime()

    expect(createdTime).toBeGreaterThanOrEqual(beforeTime)
    expect(createdTime).toBeLessThanOrEqual(afterTime)
    expect(updatedTime).toBeGreaterThanOrEqual(beforeTime)
    expect(updatedTime).toBeLessThanOrEqual(afterTime)
  })
})

describe('DictionaryTable - Business Logic', () => {
  beforeEach(() => {
    mockRun.mockClear()
    mockGet.mockClear()
    mockAll.mockClear()
  })

  describe('insert', () => {
    test('should generate UUID for new dictionary item', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        word: 'example',
        pronunciation: 'ig-ZAM-pul',
      }

      mockRun.mockResolvedValue(undefined)

      const result = await DictionaryTable.insert(insertData)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('test-uuid-123')
        expect(result.data.user_id).toBe(TEST_USER_ID)
        expect(result.data.word).toBe('example')
        expect(result.data.pronunciation).toBe('ig-ZAM-pul')
      }
    })

    test('should set created_at and updated_at to sensible values', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        word: 'timestamp',
        pronunciation: 'TIME-stamp',
      }

      mockRun.mockResolvedValue(undefined)
      const beforeTime = Date.now()

      const result = await DictionaryTable.insert(insertData)

      const afterTime = Date.now()

      expect(result.success).toBe(true)
      if (result.success) {
        // Verify timestamps are defined and valid ISO strings
        expect(result.data.created_at).toBeDefined()
        expect(result.data.updated_at).toBeDefined()
        expect(() => new Date(result.data.created_at)).not.toThrow()
        expect(() => new Date(result.data.updated_at)).not.toThrow()

        // Verify timestamps are within reasonable time range
        const createdTime = new Date(result.data.created_at).getTime()
        const updatedTime = new Date(result.data.updated_at).getTime()

        expect(createdTime).toBeGreaterThanOrEqual(beforeTime)
        expect(createdTime).toBeLessThanOrEqual(afterTime)
        expect(updatedTime).toBeGreaterThanOrEqual(beforeTime)
        expect(updatedTime).toBeLessThanOrEqual(afterTime)

        // Verify deleted_at is null for new items
        expect(result.data.deleted_at).toBeNull()
      }
    })

    test('should preserve all input fields correctly', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        word: 'preserve',
        pronunciation: 'pri-ZURV',
      }

      mockRun.mockResolvedValue(undefined)

      const result = await DictionaryTable.insert(insertData)

      expect(result.success).toBe(true)
      if (result.success) {
        // Should preserve input data exactly
        expect(result.data.user_id).toBe(TEST_USER_ID)
        expect(result.data.word).toBe('preserve')
        expect(result.data.pronunciation).toBe('pri-ZURV')

        // Should add generated fields
        expect(result.data.id).toBeDefined()
        expect(result.data.created_at).toBeDefined()
        expect(result.data.updated_at).toBeDefined()
        expect(result.data.deleted_at).toBeNull()
      }
    })

    test('should handle null pronunciation correctly', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        word: 'simple',
        pronunciation: null,
      }

      mockRun.mockResolvedValue(undefined)

      const result = await DictionaryTable.insert(insertData)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.word).toBe('simple')
        expect(result.data.pronunciation).toBeNull()
        expect(result.data.id).toBeDefined()
        expect(result.data.created_at).toBeDefined()
      }
    })

    test('should handle unique constraint error correctly', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        word: 'duplicate',
        pronunciation: null,
      }

      // Mock unique constraint error
      const constraintError = new Error('UNIQUE constraint failed')
      constraintError.code = 'SQLITE_CONSTRAINT_UNIQUE'
      mockRun.mockRejectedValue(constraintError)

      const result = await DictionaryTable.insert(insertData)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(
          '"duplicate" already exists in your dictionary',
        )
        expect(result.errorType).toBe('DUPLICATE')
      }
    })

    test('should handle general database error correctly', async () => {
      const insertData = {
        user_id: TEST_USER_ID,
        word: 'error',
        pronunciation: null,
      }

      // Mock general database error
      const dbError = new Error('Database connection failed')
      mockRun.mockRejectedValue(dbError)

      const result = await DictionaryTable.insert(insertData)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Database connection failed')
        expect(result.errorType).toBe('UNKNOWN')
      }
    })
  })

  describe('update', () => {
    test('should call run with sensible updated_at timestamp', async () => {
      mockRun.mockResolvedValue(undefined)
      const beforeTime = Date.now()

      const result = await DictionaryTable.update(
        'dict-1',
        'updated',
        'up-DAY-ted',
      )

      const afterTime = Date.now()

      expect(result.success).toBe(true)

      // Verify the call was made with correct parameters
      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE dictionary_items SET word = ?, pronunciation = ?, updated_at = ? WHERE id = ?',
        ['updated', 'up-DAY-ted', expect.any(String), 'dict-1'],
      )

      // Extract and verify the timestamp
      const call = mockRun.mock.calls[0]
      const updatedAtTimestamp = call[1][2] // third parameter (updated_at)

      // Verify it's a valid ISO string within reasonable time range
      expect(() => new Date(updatedAtTimestamp)).not.toThrow()
      const timestampTime = new Date(updatedAtTimestamp).getTime()
      expect(timestampTime).toBeGreaterThanOrEqual(beforeTime)
      expect(timestampTime).toBeLessThanOrEqual(afterTime)
    })

    test('should handle null pronunciation in update', async () => {
      mockRun.mockResolvedValue(undefined)

      const result = await DictionaryTable.update('dict-1', 'updated', null)

      expect(result.success).toBe(true)

      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE dictionary_items SET word = ?, pronunciation = ?, updated_at = ? WHERE id = ?',
        ['updated', null, expect.any(String), 'dict-1'],
      )
    })

    test('should update timestamp even with same word and pronunciation', async () => {
      mockRun.mockResolvedValue(undefined)

      const result = await DictionaryTable.update('dict-1', 'same', 'same')

      expect(result.success).toBe(true)

      const call = mockRun.mock.calls[0]
      const updatedAtTimestamp = call[1][2]

      // Should still generate a new timestamp
      expect(updatedAtTimestamp).toBeDefined()
      expect(() => new Date(updatedAtTimestamp)).not.toThrow()
    })

    test('should handle unique constraint error in update', async () => {
      const constraintError = new Error('UNIQUE constraint failed')
      constraintError.code = 'SQLITE_CONSTRAINT_UNIQUE'
      mockRun.mockRejectedValue(constraintError)

      const result = await DictionaryTable.update('dict-1', 'duplicate', null)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(
          '"duplicate" already exists in your dictionary',
        )
        expect(result.errorType).toBe('DUPLICATE')
      }
    })
  })

  describe('softDelete', () => {
    test('should call run with sensible updated_at and deleted_at timestamps', async () => {
      mockRun.mockResolvedValue(undefined)
      const beforeTime = Date.now()

      await DictionaryTable.softDelete('dict-1')

      const afterTime = Date.now()

      // Verify the call was made with correct SQL and parameter structure
      expect(mockRun).toHaveBeenCalledWith(
        'UPDATE dictionary_items SET deleted_at = ?, updated_at = ? WHERE id = ?',
        [expect.any(String), expect.any(String), 'dict-1'],
      )

      // Extract and verify both timestamps
      const call = mockRun.mock.calls[0]
      const deletedAtTimestamp = call[1][0] // first parameter (deleted_at)
      const updatedAtTimestamp = call[1][1] // second parameter (updated_at)

      // Verify both are valid ISO strings within reasonable time range
      expect(() => new Date(deletedAtTimestamp)).not.toThrow()
      expect(() => new Date(updatedAtTimestamp)).not.toThrow()

      const deletedAtTime = new Date(deletedAtTimestamp).getTime()
      const updatedAtTime = new Date(updatedAtTimestamp).getTime()

      expect(deletedAtTime).toBeGreaterThanOrEqual(beforeTime)
      expect(deletedAtTime).toBeLessThanOrEqual(afterTime)
      expect(updatedAtTime).toBeGreaterThanOrEqual(beforeTime)
      expect(updatedAtTime).toBeLessThanOrEqual(afterTime)
    })

    test('updated_at and deleted_at should be the same', async () => {
      mockRun.mockResolvedValue(undefined)

      await DictionaryTable.softDelete('dict-1')

      const call = mockRun.mock.calls[0]
      const deletedAtTimestamp = call[1][0]
      const updatedAtTimestamp = call[1][1]

      const deletedAtTime = new Date(deletedAtTimestamp).getTime()
      const updatedAtTime = new Date(updatedAtTimestamp).getTime()

      expect(deletedAtTime).toBe(updatedAtTime)
    })
  })
})
