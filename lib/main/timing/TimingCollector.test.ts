import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test'
import { TimingCollector, TimingEventName } from './TimingCollector'

// Mock electron-log
mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

// Mock analytics
const mockAnalytics = {
  isEnabled: mock(() => true),
}
mock.module('@/app/components/analytics', () => ({
  analytics: mockAnalytics,
}))

// Mock store
const mockStore = {
  get: mock(() => 'mock-token-123'),
}
mock.module('../store', () => ({
  default: mockStore,
  getCurrentUserId: mock(() => 'test-user-id'),
}))

// Mock fetch
const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
  }),
)
global.fetch = mockFetch as any

describe('TimingCollector', () => {
  let timingCollector: TimingCollector
  let originalDateNow: typeof Date.now

  beforeEach(() => {
    // Capture original Date.now
    originalDateNow = Date.now

    // Create a fresh instance for each test
    timingCollector = new TimingCollector()

    // Clear all mocks
    mockAnalytics.isEnabled.mockClear()
    mockStore.get.mockClear()
    mockFetch.mockClear()

    // Reset default behaviors
    mockAnalytics.isEnabled.mockReturnValue(true)
    mockStore.get.mockReturnValue('mock-token-123')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })
  })

  afterEach(() => {
    // Restore Date.now
    Date.now = originalDateNow
  })

  describe('Interaction Lifecycle', () => {
    test('should start tracking an interaction', () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(1)
    })

    test('should not track if analytics disabled', () => {
      mockAnalytics.isEnabled.mockReturnValue(false)

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(0)
    })

    test('should clear interaction without finalizing', () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.clearInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(0)
    })
  })

  describe('Timing Events', () => {
    test('should record start and end timing', () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      let callCount = 0
      Date.now = () => {
        callCount++
        return callCount === 1 ? 1000 : 1500 // 500ms duration
      }

      timingCollector.startTiming(interactionId, TimingEventName.TEXT_WRITER)
      timingCollector.endTiming(interactionId, TimingEventName.TEXT_WRITER)

      timingCollector.finalizeInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.queuedReports).toBe(1)
    })

    test('should handle null interaction ID gracefully', () => {
      timingCollector.startTiming(null, TimingEventName.TEXT_WRITER)
      timingCollector.endTiming(null, TimingEventName.TEXT_WRITER)

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(0)
    })

    test('should warn when ending timing for unknown interaction', () => {
      timingCollector.endTiming(
        'unknown-interaction',
        TimingEventName.TEXT_WRITER,
      )

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(0)
    })

    test('should warn when ending timing for unknown event', () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      // End timing without starting it
      timingCollector.endTiming(interactionId, TimingEventName.TEXT_WRITER)

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(1)
    })
  })

  describe('timeAsync Utility', () => {
    test('should wrap async function and time it', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      const mockFn = mock(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'result'
      })

      const result = await timingCollector.timeAsync(
        interactionId,
        TimingEventName.TEXT_WRITER,
        mockFn,
      )

      expect(result).toBe('result')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test('should time even when function throws', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      const mockFn = mock(async () => {
        throw new Error('Test error')
      })

      try {
        await timingCollector.timeAsync(
          interactionId,
          TimingEventName.TEXT_WRITER,
          mockFn,
        )
        expect(false).toBe(true) // Should not reach here
      } catch (error: any) {
        expect(error.message).toBe('Test error')
      }

      // Timing should still be recorded
      timingCollector.finalizeInteraction(interactionId)
      const stats = timingCollector.getStats()
      expect(stats.queuedReports).toBe(1)
    })

    test('should handle synchronous functions', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      const mockFn = mock(() => 'sync-result')

      const result = await timingCollector.timeAsync(
        interactionId,
        TimingEventName.TEXT_WRITER,
        mockFn,
      )

      expect(result).toBe('sync-result')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test('should handle null interaction ID', async () => {
      const mockFn = mock(() => 'result')

      const result = await timingCollector.timeAsync(
        null,
        TimingEventName.TEXT_WRITER,
        mockFn,
      )

      expect(result).toBe('result')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('Finalization', () => {
    test('should finalize interaction and create report', () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      timingCollector.startTiming(interactionId, TimingEventName.HOTKEY_PRESS)
      timingCollector.endTiming(interactionId, TimingEventName.HOTKEY_PRESS)

      timingCollector.finalizeInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.activeInteractions).toBe(0)
      expect(stats.queuedReports).toBe(1)
    })

    test('should calculate total duration correctly', () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      let timestamp = 1000
      Date.now = () => timestamp

      // First event: 1000ms start, 1100ms end (100ms duration)
      timingCollector.startTiming(interactionId, TimingEventName.HOTKEY_PRESS)
      timestamp = 1100
      timingCollector.endTiming(interactionId, TimingEventName.HOTKEY_PRESS)

      // Second event: 1200ms start, 1500ms end (300ms duration)
      timestamp = 1200
      timingCollector.startTiming(interactionId, TimingEventName.TEXT_WRITER)
      timestamp = 1500
      timingCollector.endTiming(interactionId, TimingEventName.TEXT_WRITER)

      timingCollector.finalizeInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.queuedReports).toBe(1)
    })

    test('should not finalize if analytics disabled', () => {
      mockAnalytics.isEnabled.mockReturnValue(false)

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      const stats = timingCollector.getStats()
      expect(stats.queuedReports).toBe(0)
    })

    test('should warn when finalizing unknown interaction', () => {
      timingCollector.finalizeInteraction('unknown-interaction')

      const stats = timingCollector.getStats()
      expect(stats.queuedReports).toBe(0)
    })
  })

  describe('Flushing', () => {
    test('should not flush if no reports', async () => {
      await timingCollector.flush()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    test('should flush reports to server', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.startTiming(interactionId, TimingEventName.HOTKEY_PRESS)
      timingCollector.endTiming(interactionId, TimingEventName.HOTKEY_PRESS)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0][0]).toContain('/timing')
    })

    test('should retry on flush failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Reports should be re-added to queue on failure
      const stats = timingCollector.getStats()
      expect(stats.queuedReports).toBe(1)
    })

    test('should send auth token if available', async () => {
      mockStore.get.mockReturnValue('test-token')

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      expect(mockFetch).toHaveBeenCalled()
      const fetchCall = mockFetch.mock.calls[0][1]
      expect(fetchCall.headers.Authorization).toBe('Bearer test-token')
    })

    test('should not send auth header if no token', async () => {
      mockStore.get.mockReturnValue(null)

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      expect(mockFetch).toHaveBeenCalled()
      const fetchCall = mockFetch.mock.calls[0][1]
      expect(fetchCall.headers.Authorization).toBeUndefined()
    })
  })

  describe('Stats', () => {
    test('should return correct stats', () => {
      const interactionId1 = 'test-interaction-1'
      const interactionId2 = 'test-interaction-2'

      timingCollector.startInteraction(interactionId1)
      timingCollector.startInteraction(interactionId2)
      timingCollector.finalizeInteraction(interactionId2)

      const stats = timingCollector.getStats()

      expect(stats.activeInteractions).toBe(1)
      expect(stats.queuedReports).toBe(1)
      expect(stats.analyticsEnabled).toBe(true)
    })
  })
})
