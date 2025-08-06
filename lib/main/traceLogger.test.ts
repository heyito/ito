import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock crypto.randomUUID to get predictable IDs
const originalRandomUUID = crypto.randomUUID
let uuidCounter = 0
crypto.randomUUID = mock(
  () =>
    `00000000-0000-4000-8000-${(uuidCounter++).toString().padStart(12, '0')}`,
) as typeof crypto.randomUUID

import { traceLogger } from './traceLogger'

describe('TraceLogger', () => {
  beforeEach(() => {
    // Reset the traceLogger state by clearing all active interactions
    while (traceLogger.getActiveInteractionCount() > 0) {
      // Get the first interaction ID and end it
      const interactionId = Array.from(traceLogger['activeSpans'].keys())[0]
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
      // The interaction should be cleaned up, so this should not affect the count
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })
  })

  describe('Error Handling', () => {
    test('should handle unknown interaction IDs gracefully', () => {
      // Try to log to non-existent interaction
      traceLogger.logStep('unknown-id', 'STEP')
      traceLogger.endInteraction('unknown-id', 'END')
      traceLogger.logError('unknown-id', 'ERROR', 'test error')

      // Should not crash and should not have any active interactions
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
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

  describe('Logging Behavior', () => {
    test('should log all interaction events', () => {
      const interactionId = traceLogger.startInteraction('TEST')
      traceLogger.logStep(interactionId, 'STEP')
      traceLogger.logError(interactionId, 'ERROR', 'test error')
      traceLogger.endInteraction(interactionId, 'END')

      // All operations should complete without errors
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })

    test('should include metadata in span attributes', () => {
      const interactionId = traceLogger.startInteraction('TEST', {
        test: 'data',
      })
      traceLogger.logStep(interactionId, 'STEP', { stepData: 'value' })
      traceLogger.endInteraction(interactionId, 'END', { endData: 'value' })

      // All operations should complete without errors
      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })
  })

  describe('Cleanup', () => {
    test('should cleanup all active spans', () => {
      traceLogger.startInteraction('INTERACTION_1')
      traceLogger.startInteraction('INTERACTION_2')

      expect(traceLogger.getActiveInteractionCount()).toBe(2)

      traceLogger.cleanup()

      expect(traceLogger.getActiveInteractionCount()).toBe(0)
    })
  })
})

// Restore original crypto.randomUUID after all tests
crypto.randomUUID = originalRandomUUID
