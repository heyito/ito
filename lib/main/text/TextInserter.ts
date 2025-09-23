import { setFocusedText } from '../../media/text-writer'
import { traceLogger } from '../traceLogger'

export class TextInserter {
  async insertText(
    transcript: string,
    interactionId: string | null,
  ): Promise<boolean> {
    if (!transcript) {
      return false
    }

    try {
      const success = await setFocusedText(transcript)

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
