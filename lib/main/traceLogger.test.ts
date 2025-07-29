import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock electron-log
const mockLog = {
  info: mock(),
  warn: mock(),
  error: mock(),
}
mock.module('electron-log', () => ({
  default: mockLog,
}))

// Mock uuid with unique IDs
let uuidCounter = 0
mock.module('uuid', () => ({
  v4: mock(() => `test-interaction-id-${++uuidCounter}`),
}))

import { traceLogger } from './traceLogger'

describe('TraceLogger', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    mockLog.info.mockClear()
    mockLog.warn.mockClear()
    mockLog.error.mockClear()

    // Reset the traceLogger state by clearing all active interactions
    while (traceLogger.getActiveInteractionCount() > 0) {
      // Get the first interaction ID and end it
      const interactionId = traceLogger['activeInteractions']
        .keys()
        .next().value
      if (interactionId) {
        traceLogger.endInteraction(interactionId, 'TEST_CLEANUP')
      }
    }
  })

  describe('Interaction Management', () => {
    test('should track active interactions correctly', () => {
      expect(traceLogger.getActiveInteractionCount()).toBe(0)

      const id1 = traceLogger.startInteraction('TEST_1')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)

      const id2 = traceLogger.startInteraction('TEST_2')
      expect(traceLogger.getActiveInteractionCount()).toBe(2)

      traceLogger.endInteraction(id1, 'END_1')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)

      traceLogger.endInteraction(id2, 'END_2')
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })

    test('should prevent memory leaks by cleaning up ended interactions', () => {
      const interactionId = traceLogger.startInteraction('TEST')
      traceLogger.logStep(interactionId, 'STEP_1')
      traceLogger.logStep(interactionId, 'STEP_2')

      traceLogger.endInteraction(interactionId, 'END')

      // Should not be able to log to ended interaction
      traceLogger.logStep(interactionId, 'STEP_3')
      expect(mockLog.warn).toHaveBeenCalledWith(
        '[TraceLogger] Attempted to log step for unknown interaction: test-interaction-id-3',
      )
    })
  })

  describe('Error Handling', () => {
    test('should handle unknown interaction IDs gracefully', () => {
      // Try to log to non-existent interaction
      traceLogger.logStep('unknown-id', 'STEP')
      traceLogger.endInteraction('unknown-id', 'END')
      traceLogger.logError('unknown-id', 'ERROR', 'test error')

      // Should log warnings but not crash
      expect(mockLog.warn).toHaveBeenCalledTimes(3)
    })

    test('should maintain system stability when errors occur', () => {
      const interactionId = traceLogger.startInteraction('TEST')

      // Log an error within valid interaction
      traceLogger.logError(interactionId, 'ERROR_STEP', 'Test error')

      // System should still work normally
      expect(traceLogger.getActiveInteractionCount()).toBe(1)
      traceLogger.logStep(interactionId, 'NEXT_STEP')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)
    })
  })

  describe('Timing Accuracy', () => {
    test('should calculate accurate durations', () => {
      const originalDateNow = Date.now
      let timeCounter = 1000
      Date.now = mock(() => timeCounter++)

      const interactionId = traceLogger.startInteraction('TEST')
      traceLogger.logStep(interactionId, 'STEP_1')
      traceLogger.logStep(interactionId, 'STEP_2')
      traceLogger.endInteraction(interactionId, 'END')

      // Verify timing calculations are correct
      const calls = mockLog.info.mock.calls
      const step1Call = calls.find(call => call[1].includes('"step":"STEP_1"'))
      const step2Call = calls.find(call => call[1].includes('"step":"STEP_2"'))
      const endCall = calls.find(call => call[1].includes('"step":"END"'))

      expect(step1Call![1]).toContain('"duration":1')
      expect(step2Call![1]).toContain('"duration":2')
      expect(endCall![1]).toContain('"duration":3')

      Date.now = originalDateNow
    })
  })

  describe('Concurrent Usage', () => {
    test('should handle multiple simultaneous interactions', () => {
      const id1 = traceLogger.startInteraction('INTERACTION_1')
      const id2 = traceLogger.startInteraction('INTERACTION_2')
      const id3 = traceLogger.startInteraction('INTERACTION_3')

      // All should be active
      expect(traceLogger.getActiveInteractionCount()).toBe(3)

      // Each should be independent
      traceLogger.logStep(id1, 'STEP_1')
      traceLogger.logStep(id2, 'STEP_2')
      traceLogger.logStep(id3, 'STEP_3')

      // End them in different order
      traceLogger.endInteraction(id2, 'END_2')
      expect(traceLogger.getActiveInteractionCount()).toBe(2)

      traceLogger.endInteraction(id1, 'END_1')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)

      traceLogger.endInteraction(id3, 'END_3')
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })
  })

  describe('Logging Behavior', () => {
    test('should log all interaction events', () => {
      const interactionId = traceLogger.startInteraction('TEST')
      traceLogger.logStep(interactionId, 'STEP')
      traceLogger.logError(interactionId, 'ERROR', 'test error')
      traceLogger.endInteraction(interactionId, 'END')

      // Should have logged: START, STEP, ERROR, END
      expect(mockLog.info).toHaveBeenCalledTimes(4)
    })

    test('should include all required fields in log entries', () => {
      const interactionId = traceLogger.startInteraction('TEST', {
        test: 'data',
      })
      traceLogger.logStep(interactionId, 'STEP', { stepData: 'value' })
      traceLogger.endInteraction(interactionId, 'END', { endData: 'value' })

      const calls = mockLog.info.mock.calls

      // Check that all entries have required fields
      calls.forEach(call => {
        const logEntry = JSON.parse(call[1])
        expect(logEntry).toHaveProperty('eventType')
        expect(logEntry).toHaveProperty('interactionId')
        expect(logEntry).toHaveProperty('step')
        expect(logEntry).toHaveProperty('timestamp')
        // duration is optional, so don't require it
      })
    })
  })
})
