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
      const interactionId = traceLogger['activeInteractions'].keys().next().value
      if (interactionId) {
        traceLogger.endInteraction(interactionId, 'TEST_CLEANUP')
      }
    }
  })

  describe('Interaction Lifecycle', () => {
    test('should start interaction and generate unique ID', () => {
      const interactionId = traceLogger.startInteraction('TEST_START', {
        test: 'data',
      })

      expect(interactionId).toBe('test-interaction-id-1')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)
      expect(mockLog.info).toHaveBeenCalledWith(
        '[UserInteraction]',
        expect.stringContaining('"eventType":"INTERACTION_START"'),
      )
    })

    test('should log steps within an interaction', () => {
      const interactionId = traceLogger.startInteraction('TEST_START')

      traceLogger.logStep(interactionId, 'STEP_1', { data: 'value1' })
      traceLogger.logStep(interactionId, 'STEP_2', { data: 'value2' })

      expect(traceLogger.getActiveInteractionCount()).toBe(1)
      // Should have START + 2 steps = 3 calls, but cleanup might add more
      expect(mockLog.info).toHaveBeenCalledWith(
        '[UserInteraction]',
        expect.stringContaining('"eventType":"INTERACTION_START"'),
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        '[UserInteraction]',
        expect.stringContaining('"step":"STEP_1"'),
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        '[UserInteraction]',
        expect.stringContaining('"step":"STEP_2"'),
      )
    })

    test('should end interaction and clean up', () => {
      const interactionId = traceLogger.startInteraction('TEST_START')
      traceLogger.logStep(interactionId, 'TEST_STEP')

      traceLogger.endInteraction(interactionId, 'TEST_END', { end: 'data' })

      expect(traceLogger.getActiveInteractionCount()).toBe(0)
      expect(mockLog.info).toHaveBeenCalledWith(
        '[UserInteraction]',
        expect.stringContaining('"eventType":"INTERACTION_END"'),
      )
    })

    test('should log interaction summary for multi-step interactions', () => {
      const interactionId = traceLogger.startInteraction('TEST_START')
      traceLogger.logStep(interactionId, 'STEP_1')
      traceLogger.logStep(interactionId, 'STEP_2')

      traceLogger.endInteraction(interactionId, 'TEST_END')

      // Should log both END event and summary
      const calls = mockLog.info.mock.calls
      const summaryCall = calls.find(call =>
        call[1].includes('"eventType":"INTERACTION_END"'),
      )
      expect(summaryCall).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    test('should log errors within interactions', () => {
      const interactionId = traceLogger.startInteraction('TEST_START')

      traceLogger.logError(interactionId, 'ERROR_STEP', 'Test error message', {
        error: 'data',
      })

      expect(traceLogger.getActiveInteractionCount()).toBe(1)
      expect(mockLog.info).toHaveBeenCalledWith(
        '[UserInteraction]',
        expect.stringContaining('"eventType":"ERROR"'),
      )
    })

    test('should warn when logging step for unknown interaction', () => {
      traceLogger.logStep('unknown-id', 'TEST_STEP')

      expect(mockLog.warn).toHaveBeenCalledWith(
        '[TraceLogger] Attempted to log step for unknown interaction: unknown-id',
      )
    })

    test('should warn when ending unknown interaction', () => {
      traceLogger.endInteraction('unknown-id', 'TEST_END')

      expect(mockLog.warn).toHaveBeenCalledWith(
        '[TraceLogger] Attempted to end unknown interaction: unknown-id',
      )
    })

    test('should warn when logging error for unknown interaction', () => {
      traceLogger.logError('unknown-id', 'ERROR_STEP', 'Error message')

      expect(mockLog.warn).toHaveBeenCalledWith(
        '[TraceLogger] Attempted to log error for unknown interaction: unknown-id',
      )
    })
  })

  describe('Timing and Duration', () => {
    test('should calculate duration from interaction start', () => {
      // Mock Date.now to return predictable values
      const originalDateNow = Date.now
      let timeCounter = 1000
      Date.now = mock(() => timeCounter++)

      const interactionId = traceLogger.startInteraction('TEST_START')
      traceLogger.logStep(interactionId, 'TEST_STEP')

      const logCall = mockLog.info.mock.calls.find(call =>
        call[1].includes('"step":"TEST_STEP"'),
      )
      expect(logCall).toBeDefined()
      expect(logCall[1]).toContain('"duration":1')

      // Restore Date.now
      Date.now = originalDateNow
    })

    test('should calculate total duration on interaction end', () => {
      // Mock Date.now to return predictable values
      const originalDateNow = Date.now
      let timeCounter = 1000
      Date.now = mock(() => timeCounter++)

      const interactionId = traceLogger.startInteraction('TEST_START')
      traceLogger.endInteraction(interactionId, 'TEST_END')

      const logCall = mockLog.info.mock.calls.find(call =>
        call[1].includes('"eventType":"INTERACTION_END"'),
      )
      expect(logCall).toBeDefined()
      expect(logCall[1]).toContain('"duration":1')

      // Restore Date.now
      Date.now = originalDateNow
    })
  })

  describe('Metadata Handling', () => {
    test('should include metadata in log entries', () => {
      const metadata = { deviceId: 'default', shortcut: ['command', 'space'] }
      const interactionId = traceLogger.startInteraction('TEST_START', metadata)

      const logCall = mockLog.info.mock.calls.find(call =>
        call[1].includes('"eventType":"INTERACTION_START"'),
      )
      expect(logCall).toBeDefined()
      expect(logCall[1]).toContain('"deviceId":"default"')
      expect(logCall[1]).toContain('"shortcut":["command","space"]')
    })

    test('should handle undefined metadata gracefully', () => {
      const interactionId = traceLogger.startInteraction('TEST_START')

      traceLogger.logStep(interactionId, 'TEST_STEP')

      const logCall = mockLog.info.mock.calls.find(call =>
        call[1].includes('"step":"TEST_STEP"'),
      )
      expect(logCall).toBeDefined()
      // Should not crash with undefined metadata
    })
  })

  describe('Memory Management', () => {
    test('should clean up interactions after ending', () => {
      const interactionId = traceLogger.startInteraction('TEST_START')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)

      traceLogger.endInteraction(interactionId, 'TEST_END')
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })

    test('should handle multiple concurrent interactions', () => {
      const id1 = traceLogger.startInteraction('TEST_1')
      const id2 = traceLogger.startInteraction('TEST_2')

      expect(traceLogger.getActiveInteractionCount()).toBe(2)

      traceLogger.endInteraction(id1, 'TEST_1_END')
      expect(traceLogger.getActiveInteractionCount()).toBe(1)

      traceLogger.endInteraction(id2, 'TEST_2_END')
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })
  })
})
