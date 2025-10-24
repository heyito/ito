import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

// Mock external boundaries only - let internal logic run naturally

// Mock gRPC client
const mockGrpcClient = {
  createNote: mock(() => Promise.resolve()),
  updateNote: mock(() => Promise.resolve()),
  deleteNote: mock(() => Promise.resolve()),
  listNotesSince: mock(() => Promise.resolve([] as any)),
  createInteraction: mock(() => Promise.resolve()),
  updateInteraction: mock(() => Promise.resolve()),
  deleteInteraction: mock(() => Promise.resolve()),
  listInteractionsSince: mock(() => Promise.resolve([] as any)),
  createDictionaryItem: mock(() => Promise.resolve()),
  updateDictionaryItem: mock(() => Promise.resolve()),
  deleteDictionaryItem: mock(() => Promise.resolve()),
  listDictionaryItemsSince: mock(() => Promise.resolve([] as any)),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

// Mock electron store
const mockMainStore = {
  get: mock(),
}
mock.module('./store', () => ({
  default: mockMainStore,
  getCurrentUserId: mock(() => 'test-user-123'),
  createNewAuthState: mock(() => ({
    state: 'test-state',
    codeVerifier: 'test-verifier',
  })),
}))

// Mock repository classes and KeyValueStore
const mockNotesTable = {
  findModifiedSince: mock(() => Promise.resolve([] as any)),
  upsert: mock(() => Promise.resolve()),
  softDelete: mock(() => Promise.resolve()),
  insert: mock(() => Promise.resolve({ id: 'test-id' })),
  findById: mock(() => Promise.resolve(undefined)),
  findAll: mock(() => Promise.resolve([] as any)),
  findByInteractionId: mock(() => Promise.resolve([] as any)),
  updateContent: mock(() => Promise.resolve()),
  deleteAllUserData: mock(() => Promise.resolve()),
}

const mockInteractionsTable = {
  findModifiedSince: mock(() => Promise.resolve([] as any)),
  upsert: mock(() => Promise.resolve()),
  softDelete: mock(() => Promise.resolve()),
  insert: mock(() => Promise.resolve({ id: 'test-id' })),
  findById: mock(() => Promise.resolve(undefined)),
  findAll: mock(() => Promise.resolve([] as any)),
  deleteAllUserData: mock(() => Promise.resolve()),
}

const mockDictionaryTable = {
  findModifiedSince: mock(() => Promise.resolve([] as any)),
  upsert: mock(() => Promise.resolve()),
  softDelete: mock(() => Promise.resolve()),
  insert: mock(() => Promise.resolve({ id: 'test-id' })),
  findById: mock(() => Promise.resolve(undefined)),
  findAll: mock(() => Promise.resolve([] as any)),
  update: mock(() => Promise.resolve()),
  deleteAllUserData: mock(() => Promise.resolve()),
}

const mockKeyValueStore = {
  get: mock(() => Promise.resolve(undefined as any)),
  set: mock(() => Promise.resolve()),
}

mock.module('./sqlite/repo', () => ({
  NotesTable: mockNotesTable,
  InteractionsTable: mockInteractionsTable,
  DictionaryTable: mockDictionaryTable,
  KeyValueStore: mockKeyValueStore,
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
  console.info = mock()
})

import { syncService } from './syncService'
import { STORE_KEYS } from '../constants/store-keys'

// Track sync service calls
let syncIntervalId: any = null
const mockSetInterval = mock((fn: () => void, _delay: number) => {
  syncIntervalId = setTimeout(fn, 0) // Execute immediately for testing
  return syncIntervalId
})
const mockClearInterval = mock((id: any) => {
  if (id && typeof id === 'number') {
    clearTimeout(id)
  }
})

describe('SyncService Integration Tests', () => {
  beforeEach(() => {
    // Replace timers with mocks that work properly
    global.setInterval = mockSetInterval as any
    global.clearInterval = mockClearInterval as any

    // Reset all mocks
    Object.values(mockGrpcClient).forEach(mock => mock.mockClear())
    mockMainStore.get.mockClear()

    // Reset repository mocks
    Object.values(mockNotesTable).forEach(mock => mock.mockClear())
    Object.values(mockInteractionsTable).forEach(mock => mock.mockClear())
    Object.values(mockDictionaryTable).forEach(mock => mock.mockClear())
    Object.values(mockKeyValueStore).forEach(mock => mock.mockClear())

    mockSetInterval.mockClear()
    mockClearInterval.mockClear()

    // Setup default user profile
    mockMainStore.get.mockImplementation((key: string) => {
      if (key === STORE_KEYS.USER_PROFILE) {
        return { id: 'test-user-123' }
      }
      return null
    })

    // Setup default last sync time (KeyValueStore.get)
    mockKeyValueStore.get.mockResolvedValue('2024-01-01T00:00:00.000Z')

    // Reset repository methods to return empty by default
    mockNotesTable.findModifiedSince.mockResolvedValue([])
    mockInteractionsTable.findModifiedSince.mockResolvedValue([])
    mockDictionaryTable.findModifiedSince.mockResolvedValue([])
  })

  afterEach(() => {
    // Stop any running sync to clean up
    syncService.stop()

    // Clear any pending timeouts
    if (syncIntervalId) {
      clearTimeout(syncIntervalId)
      syncIntervalId = null
    }
  })

  describe('Sync Service Lifecycle', () => {
    test('should skip sync when no user is logged in', async () => {
      mockMainStore.get.mockReturnValue(null) // No user profile

      await syncService.start()

      // Should not attempt any gRPC operations
      Object.values(mockGrpcClient).forEach(mockFn => {
        expect(mockFn).not.toHaveBeenCalled()
      })
    })

    test('should skip sync when user profile is missing ID', async () => {
      mockMainStore.get.mockReturnValue({ name: 'Test User' }) // Missing ID

      await syncService.start()

      // Should not attempt any gRPC operations
      Object.values(mockGrpcClient).forEach(mockFn => {
        expect(mockFn).not.toHaveBeenCalled()
      })
    })
  })

  describe('Push Operations', () => {
    test('should push new notes to server', async () => {
      const testNote = {
        id: 'note-123',
        user_id: 'test-user-123',
        content: 'Test note content',
        created_at: '2024-01-02T00:00:00.000Z', // After last sync
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: null,
        interaction_id: null,
      }

      // Mock modified notes query
      mockNotesTable.findModifiedSince.mockResolvedValueOnce([testNote])

      await syncService.start()

      expect(mockGrpcClient.createNote).toHaveBeenCalledWith(testNote)
    })

    test('should push updated notes to server', async () => {
      const testNote = {
        id: 'note-123',
        user_id: 'test-user-123',
        content: 'Updated note content',
        created_at: '2023-12-01T00:00:00.000Z', // Before last sync
        updated_at: '2024-01-02T00:00:00.000Z', // After last sync
        deleted_at: null,
        interaction_id: null,
      }

      mockNotesTable.findModifiedSince.mockResolvedValueOnce([testNote])

      await syncService.start()

      expect(mockGrpcClient.updateNote).toHaveBeenCalledWith(testNote)
    })

    test('should push deleted notes to server', async () => {
      const deletedNote = {
        id: 'note-123',
        user_id: 'test-user-123',
        content: 'Deleted note',
        created_at: '2023-12-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: '2024-01-02T00:00:00.000Z',
        interaction_id: null,
      }

      mockNotesTable.findModifiedSince.mockResolvedValueOnce([deletedNote])

      await syncService.start()

      expect(mockGrpcClient.deleteNote).toHaveBeenCalledWith(deletedNote)
    })

    test('should handle push errors gracefully', async () => {
      const testNote = {
        id: 'note-123',
        user_id: 'test-user-123',
        content: 'Test note',
        created_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: null,
        interaction_id: null,
      }

      mockNotesTable.findModifiedSince.mockResolvedValueOnce([testNote])
      mockGrpcClient.createNote.mockRejectedValueOnce(
        new Error('Network error'),
      )

      await syncService.start()

      // Should continue sync despite error (error is logged)
      expect(mockGrpcClient.createNote).toHaveBeenCalledWith(testNote)
      // Should still attempt to pull data
      expect(mockGrpcClient.listNotesSince).toHaveBeenCalled()
    })
  })

  describe('Pull Operations', () => {
    test('should pull and upsert remote notes', async () => {
      const remoteNote = {
        id: 'remote-note-123',
        userId: 'test-user-123',
        content: 'Remote note content',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
        interactionId: null,
      }

      mockGrpcClient.listNotesSince.mockResolvedValueOnce([remoteNote])

      await syncService.start()

      // Should call database to upsert the remote note
      expect(mockNotesTable.upsert).toHaveBeenCalled()
    })

    test('should handle remote note deletions', async () => {
      const deletedRemoteNote = {
        id: 'remote-note-123',
        userId: 'test-user-123',
        content: 'Deleted remote note',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: '2024-01-02T00:00:00.000Z',
        interactionId: null,
      }

      mockGrpcClient.listNotesSince.mockResolvedValueOnce([deletedRemoteNote])

      await syncService.start()

      // Should call database to soft delete the note
      expect(mockNotesTable.softDelete).toHaveBeenCalledWith(
        deletedRemoteNote.id,
      )
    })

    test('should handle interactions with raw audio data', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4, 5])
      const remoteInteraction = {
        id: 'remote-interaction-123',
        userId: 'test-user-123',
        title: 'Remote interaction',
        asrOutput: JSON.stringify({ transcript: 'Hello world' }),
        llmOutput: JSON.stringify({ response: 'Hi there' }),
        rawAudio: audioData,
        durationMs: 1500,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
      }

      mockGrpcClient.listInteractionsSince.mockResolvedValueOnce([
        remoteInteraction,
      ])

      await syncService.start()

      // Should handle audio buffer conversion and database upsert
      expect(mockInteractionsTable.upsert).toHaveBeenCalled()
    })

    test('should handle dictionary items correctly', async () => {
      const remoteDictionaryItem = {
        id: 'remote-dict-123',
        userId: 'test-user-123',
        word: 'pronunciation',
        pronunciation: '/prəˌnʌnsiˈeɪʃən/',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
      }

      mockGrpcClient.listDictionaryItemsSince.mockResolvedValueOnce([
        remoteDictionaryItem,
      ])

      await syncService.start()

      // Should upsert dictionary item
      expect(mockDictionaryTable.upsert).toHaveBeenCalled()
    })
  })

  describe('Sync Timing and State', () => {
    test('should handle first-time sync (no previous sync timestamp)', async () => {
      mockKeyValueStore.get.mockResolvedValueOnce(undefined) // No previous sync

      await syncService.start()
      const epoch = new Date(0).toISOString()

      // Should still call pull operations (with undefined lastSyncedAt)
      expect(mockGrpcClient.listNotesSince).toHaveBeenCalledWith(epoch)
      expect(mockGrpcClient.listInteractionsSince).toHaveBeenCalledWith(epoch)
      expect(mockGrpcClient.listDictionaryItemsSince).toHaveBeenCalledWith(
        epoch,
      )
    })

    test('should handle sync errors and continue operation', async () => {
      mockNotesTable.findModifiedSince.mockRejectedValueOnce(
        new Error('Database error'),
      )
      // Other operations should still succeed
      mockGrpcClient.listNotesSince.mockResolvedValue([])

      await syncService.start()

      // When push operations fail, the entire sync cycle fails
      // and no pull operations are attempted
      expect(mockGrpcClient.listNotesSince).not.toHaveBeenCalled()
      expect(mockGrpcClient.listInteractionsSince).not.toHaveBeenCalled()
      expect(mockGrpcClient.listDictionaryItemsSince).not.toHaveBeenCalled()
    })
  })

  describe('Data Type Integration', () => {
    test('should handle mixed operations (create, update, delete)', async () => {
      const newNote = {
        id: 'new-note',
        created_at: '2024-01-02T00:00:00.000Z', // After last sync
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: null,
      }

      const updatedNote = {
        id: 'updated-note',
        created_at: '2023-12-01T00:00:00.000Z', // Before last sync
        updated_at: '2024-01-02T00:00:00.000Z', // After last sync
        deleted_at: null,
      }

      const deletedNote = {
        id: 'deleted-note',
        created_at: '2023-12-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: '2024-01-02T00:00:00.000Z',
      }

      mockNotesTable.findModifiedSince.mockResolvedValueOnce([
        newNote,
        updatedNote,
        deletedNote,
      ])

      await syncService.start()

      // Verify correct operations based on timestamps and deletion status
      expect(mockGrpcClient.createNote).toHaveBeenCalledWith(newNote)
      expect(mockGrpcClient.updateNote).toHaveBeenCalledWith(updatedNote)
      expect(mockGrpcClient.deleteNote).toHaveBeenCalledWith(deletedNote)
    })
  })

  describe('Critical Business Logic', () => {
    test('first sync', async () => {
      // Clear the default mock and set to return undefined for all calls
      mockKeyValueStore.get.mockReset()
      mockKeyValueStore.get.mockResolvedValue(undefined) // No previous sync
      const epoch = new Date(0).toISOString()

      await syncService.start()

      // Should NOT push anything (no lastSyncedAt means first sync)
      expect(mockNotesTable.findModifiedSince).toHaveBeenCalledWith(epoch)
      expect(mockInteractionsTable.findModifiedSince).toHaveBeenCalledWith(
        epoch,
      )
      expect(mockDictionaryTable.findModifiedSince).toHaveBeenCalledWith(epoch)

      // Should still pull everything
      expect(mockGrpcClient.listNotesSince).toHaveBeenCalledWith(epoch)
      expect(mockGrpcClient.listInteractionsSince).toHaveBeenCalledWith(epoch)
      expect(mockGrpcClient.listDictionaryItemsSince).toHaveBeenCalledWith(
        epoch,
      )
    })

    test('should push and pull data on subsequent syncs', async () => {
      mockKeyValueStore.get.mockResolvedValueOnce('2024-01-01T00:00:00.000Z') // Has previous sync

      await syncService.start()

      // Should push (checking for modifications since last sync)
      expect(mockNotesTable.findModifiedSince).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
      )
      expect(mockInteractionsTable.findModifiedSince).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
      )
      expect(mockDictionaryTable.findModifiedSince).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
      )

      // Should also pull
      expect(mockGrpcClient.listNotesSince).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
      )
      expect(mockGrpcClient.listInteractionsSince).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
      )
      expect(mockGrpcClient.listDictionaryItemsSince).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
      )
    })

    test('should prevent concurrent sync operations', async () => {
      // Make sync take longer by delaying gRPC calls
      let callCount = 0
      mockGrpcClient.listNotesSince.mockImplementation(() => {
        callCount++
        return new Promise(resolve => setTimeout(() => resolve([]), 30))
      })

      // Start first sync
      const syncPromise1 = syncService.start()

      // Small delay to ensure first sync starts
      await new Promise(resolve => setTimeout(resolve, 10))

      // Start second sync (should be ignored due to isSyncing flag)
      const syncPromise2 = syncService.start()

      await Promise.all([syncPromise1, syncPromise2])

      // Should only call gRPC operations once (second sync ignored)
      expect(callCount).toBe(1)
    })

    test('should continue processing other items when individual items fail', async () => {
      const note1 = { id: 'note-1', created_at: '2024-01-02T00:00:00.000Z' }
      const note2 = { id: 'note-2', created_at: '2024-01-02T00:00:00.000Z' }
      const note3 = { id: 'note-3', created_at: '2024-01-02T00:00:00.000Z' }

      mockNotesTable.findModifiedSince.mockResolvedValueOnce([
        note1,
        note2,
        note3,
      ])

      // Make second note fail
      mockGrpcClient.createNote
        .mockResolvedValueOnce(undefined) // note1 succeeds
        .mockRejectedValueOnce(new Error('Network error')) // note2 fails
        .mockResolvedValueOnce(undefined) // note3 should still be processed

      await syncService.start()

      // All three notes should be attempted
      expect(mockGrpcClient.createNote).toHaveBeenCalledTimes(3)
      expect(mockGrpcClient.createNote).toHaveBeenCalledWith(note1)
      expect(mockGrpcClient.createNote).toHaveBeenCalledWith(note2)
      expect(mockGrpcClient.createNote).toHaveBeenCalledWith(note3)

      // Sync should continue to pull operations despite push failure
      expect(mockGrpcClient.listNotesSince).toHaveBeenCalled()
    })

    test('should handle malformed JSON in interaction data gracefully', async () => {
      const malformedInteraction = {
        id: 'malformed-interaction',
        userId: 'test-user-123',
        asrOutput: 'invalid-json{', // Malformed JSON
        llmOutput: '{"valid": true}',
        rawAudio: null,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
      }

      mockGrpcClient.listInteractionsSince.mockResolvedValueOnce([
        malformedInteraction,
      ])

      // Should not crash on malformed JSON
      await syncService.start()

      // Should continue processing despite JSON error (error logged)
      expect(mockGrpcClient.listNotesSince).toHaveBeenCalled()
    })

    test('should handle complex raw audio buffer conversion', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
      const interactionWithAudio = {
        id: 'audio-interaction',
        userId: 'test-user-123',
        title: 'Audio test',
        asrOutput: JSON.stringify({ transcript: 'Hello' }),
        llmOutput: null,
        rawAudio: audioData,
        durationMs: 1500,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
      }

      mockGrpcClient.listInteractionsSince.mockResolvedValueOnce([
        interactionWithAudio,
      ])

      await syncService.start()

      // Should convert Uint8Array to Buffer and upsert
      expect(mockInteractionsTable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'audio-interaction',
          raw_audio: expect.any(Buffer),
        }),
      )
    })

    test('should handle empty raw audio data correctly', async () => {
      const interactionWithEmptyAudio = {
        id: 'empty-audio-interaction',
        userId: 'test-user-123',
        title: 'Empty audio test',
        asrOutput: JSON.stringify({ transcript: 'No audio' }),
        llmOutput: null,
        rawAudio: new Uint8Array([]), // Empty audio
        durationMs: 0,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
      }

      mockGrpcClient.listInteractionsSince.mockResolvedValueOnce([
        interactionWithEmptyAudio,
      ])

      await syncService.start()

      // Should handle empty audio buffer gracefully
      expect(mockInteractionsTable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'empty-audio-interaction',
          raw_audio: null, // Empty audio should become null
        }),
      )
    })

    test('should update timestamp only after successful complete sync', async () => {
      // All operations succeed and at least one change is processed (ensures cursor advances)
      const remoteNote = {
        id: 'remote-note-for-timestamp',
        userId: 'test-user-123',
        content: 'Remote note content',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
        interactionId: null,
      }
      mockGrpcClient.listNotesSince.mockResolvedValueOnce([remoteNote])
      mockGrpcClient.listInteractionsSince.mockResolvedValue([])
      mockGrpcClient.listDictionaryItemsSince.mockResolvedValue([])

      const startTime = Date.now()
      await syncService.start()
      const endTime = Date.now()

      // Timestamp should be updated with current time using namespaced key
      expect(mockKeyValueStore.set).toHaveBeenCalledTimes(1)
      const [keyArg, valueArg] = mockKeyValueStore.set.mock.calls[0] as any
      expect(typeof keyArg).toBe('string')
      expect(keyArg.startsWith('lastSyncedAt:')).toBe(true)
      expect(keyArg.endsWith(':test-user-123')).toBe(true)
      expect(typeof valueArg).toBe('string')

      // Verify timestamp is recent (within test execution window)
      const timestamp = new Date(valueArg).getTime()
      expect(timestamp).toBeGreaterThanOrEqual(startTime)
      expect(timestamp).toBeLessThanOrEqual(endTime)
    })
  })

  describe('Singleton Pattern Business Logic', () => {
    test('should return same instance across multiple getInstance calls', async () => {
      const { SyncService } = await import('./syncService')

      const instance1 = SyncService.getInstance()
      const instance2 = SyncService.getInstance()
      const instance3 = SyncService.getInstance()

      // All calls should return the exact same instance
      expect(instance1).toBe(instance2)
      expect(instance2).toBe(instance3)
      expect(instance1).toBe(instance3)
    })

    test('should maintain singleton across different import patterns', async () => {
      const { SyncService } = await import('./syncService')
      const { syncService: exportedInstance } = await import('./syncService')

      const getInstance = SyncService.getInstance()

      // Exported instance should be same as getInstance
      expect(exportedInstance).toBe(getInstance)
    })
  })
})
