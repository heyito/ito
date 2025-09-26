import { setFocusedText } from '../../media/text-writer'
import { traceLogger } from '../traceLogger'
import { timingService, TimingEvent } from '../timingService'

export class TextInserter {
  async insertText(
    transcript: string,
    interactionId: string | null,
  ): Promise<boolean> {
    if (!transcript) {
      return false
    }

    try {
      // Record timing for output start
      timingService.recordEvent(TimingEvent.OUTPUT_START, {
        transcriptLength: transcript.length
      })

      const success = await setFocusedText(transcript)

      // Record timing for output complete
      timingService.recordEvent(TimingEvent.OUTPUT_COMPLETE, {
        success
      })

      // Log text insertion
      if (interactionId) {
        traceLogger.logStep(interactionId, 'TEXT_INSERTION', {
          transcript,
          transcriptLength: transcript.length,
          success,
        })
      }

      return success
    } catch (error) {
      console.error('Error inserting text:', error)

      if (interactionId) {
        traceLogger.logError(
          interactionId,
          'TEXT_INSERTION_ERROR',
          error instanceof Error ? error.message : String(error),
        )
      }

      return false
    }
  }
}
