import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test'

// Mock electron-log
mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

// Mock store
const mockStore = {
  get: mock((key: string) => {
    if (key === 'settings') {
      return { shareAnalytics: true }
    }
    return undefined
  }),
}
mock.module('../store', () => ({
  default: mockStore,
  store: mockStore,
  getCurrentUserId: mock(() => 'test-user-id'),
}))

// Mock grpcClient
const mockSubmitTimingReports = mock(() => Promise.resolve({}))
mock.module('../../clients/grpcClient', () => ({
  grpcClient: {
    submitTimingReports: mockSubmitTimingReports,
  },
}))

// Import after all mocks are set up
import { TimingCollector, TimingEventName } from './TimingCollector'

describe('TimingCollector', () => {
  let timingCollector: TimingCollector
  let originalDateNow: typeof Date.now

  beforeEach(() => {
    // Capture original Date.now
    originalDateNow = Date.now

    // Create a fresh instance for each test
    timingCollector = new TimingCollector()

    // Clear all mocks
    mockStore.get.mockClear()
    mockSubmitTimingReports.mockClear()

    // Reset default behaviors
    mockStore.get.mockImplementation((key: string) => {
      if (key === 'settings') {
        return { shareAnalytics: true }
      }
      return undefined
    })
    mockSubmitTimingReports.mockResolvedValue({})
  })

  afterEach(() => {
    // Restore Date.now
    Date.now = originalDateNow
  })

  describe('Interaction Lifecycle', () => {
    test('should start tracking an interaction', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should have sent a report
      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
    })

    test('should not track if analytics disabled', async () => {
      mockStore.get.mockImplementation((key: string) => {
        if (key === 'settings') {
          return { shareAnalytics: false }
        }
        return undefined
      })

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should not have sent any reports
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })

    test('should clear interaction without finalizing', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.clearInteraction(interactionId)

      await timingCollector.flush()

      // Should not have sent any reports (cleared before finalizing)
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })
  })

  describe('Timing Events', () => {
    test('should record start and end timing', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      timingCollector.startTiming(TimingEventName.TEXT_WRITER, interactionId)
      timingCollector.endTiming(TimingEventName.TEXT_WRITER, interactionId)

      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should have sent a report
      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
    })

    test('should handle null interaction ID gracefully', async () => {
      timingCollector.startTiming(TimingEventName.TEXT_WRITER)
      timingCollector.endTiming(TimingEventName.TEXT_WRITER)

      await timingCollector.flush()

      // Should not send any reports
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })

    test('should warn when ending timing for unknown interaction', async () => {
      timingCollector.endTiming(
        TimingEventName.TEXT_WRITER,
        'unknown-interaction',
      )

      await timingCollector.flush()

      // Should not send any reports (no interaction was started)
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })

    test('should warn when ending timing for unknown event', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      // End timing without starting it
      timingCollector.endTiming(TimingEventName.TEXT_WRITER, interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should still send a report even though event wasn't started
      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
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
        TimingEventName.TEXT_WRITER,
        mockFn,
        interactionId,
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
          TimingEventName.TEXT_WRITER,
          mockFn,
          interactionId,
        )
        expect(false).toBe(true) // Should not reach here
      } catch (error: any) {
        expect(error.message).toBe('Test error')
      }

      // Timing should still be recorded and sent
      timingCollector.finalizeInteraction(interactionId)
      await timingCollector.flush()

      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
    })

    test('should handle synchronous functions', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      const mockFn = mock(() => 'sync-result')

      const result = await timingCollector.timeAsync(
        TimingEventName.TEXT_WRITER,
        mockFn,
        interactionId,
      )

      expect(result).toBe('sync-result')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    test('should handle null interaction ID', async () => {
      const mockFn = mock(() => 'result')

      const result = await timingCollector.timeAsync(
        TimingEventName.TEXT_WRITER,
        mockFn,
        undefined,
      )

      expect(result).toBe('result')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('Finalization', () => {
    test('should finalize interaction and create report', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      timingCollector.startTiming(
        TimingEventName.INTERACTION_ACTIVE,
        interactionId,
      )
      timingCollector.endTiming(
        TimingEventName.INTERACTION_ACTIVE,
        interactionId,
      )

      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should have sent a report
      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
    })

    test('should calculate total duration correctly', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)

      // First event
      timingCollector.startTiming(
        TimingEventName.INTERACTION_ACTIVE,
        interactionId,
      )
      timingCollector.endTiming(
        TimingEventName.INTERACTION_ACTIVE,
        interactionId,
      )

      // Second event
      timingCollector.startTiming(TimingEventName.TEXT_WRITER, interactionId)
      timingCollector.endTiming(TimingEventName.TEXT_WRITER, interactionId)

      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should have sent a report with both events
      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
      const calls = mockSubmitTimingReports.mock.calls as any[]
      const reports = calls[0][0]
      expect(reports).toHaveLength(1)
      expect(reports[0].events).toHaveLength(2)
    })

    test('should not finalize if analytics disabled', async () => {
      mockStore.get.mockImplementation((key: string) => {
        if (key === 'settings') {
          return { shareAnalytics: false }
        }
        return undefined
      })

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Should not send any reports
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })

    test('should warn when finalizing unknown interaction', async () => {
      timingCollector.finalizeInteraction('unknown-interaction')

      await timingCollector.flush()

      // Should not send any reports
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })
  })

  describe('Flushing', () => {
    test('should not flush if no reports', async () => {
      await timingCollector.flush()
      expect(mockSubmitTimingReports).not.toHaveBeenCalled()
    })

    test('should flush reports to server', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.startTiming(
        TimingEventName.INTERACTION_ACTIVE,
        interactionId,
      )
      timingCollector.endTiming(
        TimingEventName.INTERACTION_ACTIVE,
        interactionId,
      )
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
      const calls = mockSubmitTimingReports.mock.calls as any[]
      const reports = calls[0][0]
      expect(reports).toHaveLength(1)
    })

    test('should retry on flush failure', async () => {
      mockSubmitTimingReports.mockRejectedValueOnce(new Error('Server error'))

      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      // Reports should be re-added to queue on failure
      // Try flushing again - should retry with the same report
      mockSubmitTimingReports.mockResolvedValueOnce({})
      await timingCollector.flush()

      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(2)
    })

    test('should send reports via grpc client', async () => {
      const interactionId = 'test-interaction-1'
      timingCollector.startInteraction(interactionId)
      timingCollector.finalizeInteraction(interactionId)

      await timingCollector.flush()

      expect(mockSubmitTimingReports).toHaveBeenCalled()
      const calls = mockSubmitTimingReports.mock.calls as any[]
      const reports = calls[0][0]
      expect(reports).toBeDefined()
      expect(Array.isArray(reports)).toBe(true)
    })
  })

  describe('Multiple Interactions', () => {
    test('should handle multiple interactions correctly', async () => {
      const interactionId1 = 'test-interaction-1'
      const interactionId2 = 'test-interaction-2'

      timingCollector.startInteraction(interactionId1)
      timingCollector.startInteraction(interactionId2)
      timingCollector.finalizeInteraction(interactionId2)

      await timingCollector.flush()

      // Should have sent one report (only interactionId2 was finalized)
      expect(mockSubmitTimingReports).toHaveBeenCalledTimes(1)
      const calls = mockSubmitTimingReports.mock.calls as any[]
      const reports = calls[0][0]
      expect(reports).toHaveLength(1)
      expect(reports[0].interactionId).toBe(interactionId2)
    })
  })
})
