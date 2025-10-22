import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock database utilities
const mockDbRun = mock(() => Promise.resolve())
const mockDbGet = mock(() => Promise.resolve(undefined))
const mockDbAll = mock(() => Promise.resolve([]))

mock.module('../sqlite/utils', () => ({
  run: mockDbRun,
  get: mockDbGet,
  all: mockDbAll,
}))

// Mock electron-store
mock.module('electron-store', () => {
  return {
    default: class MockStore {
      get() {
        return null
      }
      set() {}
      delete() {}
    },
  }
})

// Mock the store
const mockMainStore = {
  get: mock(() => ({ id: 'test-user-123' })),
}
mock.module('../store', () => ({
  default: mockMainStore,
}))

// Mock electron-log
mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

import { InteractionManager } from './InteractionManager'
import { STORE_KEYS } from '../../constants/store-keys'

describe('InteractionManager', () => {
  let interactionManager: InteractionManager

  beforeEach(() => {
    interactionManager = new InteractionManager()
    mockDbRun.mockClear()
    mockDbGet.mockClear()
    mockDbAll.mockClear()
    mockMainStore.get.mockClear()
    mockMainStore.get.mockReturnValue({ id: 'test-user-123' })
  })

  describe('Interaction Lifecycle', () => {
    test('should start interaction and generate ID', () => {
      const id = interactionManager.initialize()

      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      expect(interactionManager.getCurrentInteractionId()).toBe(id)
    })

    test('should track start time', () => {
      const beforeStart = Date.now()
      interactionManager.initialize()
      const afterStart = Date.now()

      const startTime = interactionManager.getInteractionStartTime()
      expect(startTime).toBeGreaterThanOrEqual(beforeStart)
      expect(startTime).toBeLessThanOrEqual(afterStart)
    })

    test('should clear current interaction', () => {
      interactionManager.initialize()
      expect(interactionManager.getCurrentInteractionId()).not.toBeNull()

      interactionManager.clearCurrentInteraction()
      expect(interactionManager.getCurrentInteractionId()).toBeNull()
      expect(interactionManager.getInteractionStartTime()).toBeNull()
    })

    test('should generate unique IDs for different interactions', () => {
      const id1 = interactionManager.initialize()
      interactionManager.clearCurrentInteraction()
      const id2 = interactionManager.initialize()

      expect(id1).not.toBe(id2)
    })
  })

  describe('Interaction Creation', () => {
    test('should create interaction with all data', async () => {
      const transcript = 'Hello world'
      const audioBuffer = Buffer.from('audio-data')
      const sampleRate = 16000

      interactionManager.initialize()
      await interactionManager.createInteraction(
        transcript,
        audioBuffer,
        sampleRate,
      )

      expect(mockDbRun).toHaveBeenCalled()
      // Check the SQL call parameters
      const call = mockDbRun.mock.calls[0]
      const sql = call[0] as unknown as string
      const params = call[1] as unknown as any[]

      expect(sql).toContain('INSERT INTO interactions')
      expect(params).toContain(interactionManager.getCurrentInteractionId())
      expect(params).toContain('test-user-123')
      expect(params).toContain(transcript)
    })

    test('should skip creation when no current interaction ID', async () => {
      // Don't start interaction
      await interactionManager.createInteraction(
        'test',
        Buffer.from('audio'),
        16000,
      )

      expect(mockDbRun).not.toHaveBeenCalled()
    })

    test('should skip creation when no user ID', async () => {
      mockMainStore.get.mockReturnValue(null)

      interactionManager.initialize()
      await interactionManager.createInteraction(
        'test',
        Buffer.from('audio'),
        16000,
      )

      expect(mockMainStore.get).toHaveBeenCalledWith(STORE_KEYS.USER_PROFILE)
      expect(mockDbRun).not.toHaveBeenCalled()
    })
  })

  describe('Title Generation', () => {
    test('should use transcript as title for short transcripts', async () => {
      const transcript = 'Short message'
      interactionManager.initialize()
      await interactionManager.createInteraction(
        transcript,
        Buffer.from('audio'),
        16000,
      )

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const titleParam = params[2] // title is at index 2
      expect(titleParam).toBe(transcript)
    })

    test('should truncate long transcripts at 50 characters', async () => {
      const longTranscript =
        'This is a very long transcript that should be truncated because it exceeds fifty characters'

      interactionManager.initialize()
      await interactionManager.createInteraction(
        longTranscript,
        Buffer.from('audio'),
        16000,
      )

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const titleParam = params[2]
      expect(titleParam).toBe(
        'This is a very long transcript that should be trun...',
      )
      expect(titleParam.length).toBe(53)
    })

    test('should use fallback title for empty transcript', async () => {
      interactionManager.initialize()
      await interactionManager.createInteraction(
        '',
        Buffer.from('audio'),
        16000,
      )

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const titleParam = params[2]
      expect(titleParam).toBe('Voice interaction')
    })
  })

  describe('Duration Calculation', () => {
    test('should calculate duration from start time', async () => {
      interactionManager.initialize()

      // Wait a bit to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 10))

      await interactionManager.createInteraction(
        'test',
        Buffer.from('audio'),
        16000,
      )

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const durationParam = params[6] // duration_ms is at index 6 in upsert
      expect(durationParam).toBeGreaterThan(0)
      expect(durationParam).toBeLessThan(1000) // Should be reasonable
    })

    test('should handle missing start time', async () => {
      // Manually set interaction ID without using initialize
      const manager = new InteractionManager()
      ;(manager as any).currentInteractionId = 'test-id'
      ;(manager as any).interactionStartTime = null

      await manager.createInteraction('test', Buffer.from('audio'), 16000)

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const durationParam = params[6] // duration_ms is at index 6 in upsert
      expect(durationParam).toBe(0)
    })
  })

  describe('Audio Buffer Handling', () => {
    test('should include audio buffer when not empty', async () => {
      const audioBuffer = Buffer.from('audio-data')

      interactionManager.initialize()
      await interactionManager.createInteraction('test', audioBuffer, 16000)

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const rawAudioParam = params[5] // raw_audio is at index 5
      expect(rawAudioParam).toEqual(audioBuffer)
    })

    test('should set null for empty audio buffer', async () => {
      const emptyBuffer = Buffer.alloc(0)

      interactionManager.initialize()
      await interactionManager.createInteraction('test', emptyBuffer, 16000)

      expect(mockDbRun).toHaveBeenCalled()
      const params = mockDbRun.mock.calls[0][1] as unknown as any[]
      const rawAudioParam = params[5]
      expect(rawAudioParam).toBeNull()
    })
  })

  describe('Error Handling', () => {
    test('should handle database insertion errors gracefully', async () => {
      mockDbRun.mockRejectedValueOnce(new Error('Database error'))

      interactionManager.initialize()

      // Should not throw - errors should be caught and logged
      await expect(
        interactionManager.createInteraction(
          'test',
          Buffer.from('audio'),
          16000,
        ),
      ).resolves.toBeUndefined()
    })
  })
})
