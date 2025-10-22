import { setFocusedText } from '../../media/text-writer'
import { timingCollector, TimingEventName } from '../timing/TimingCollector'
import { interactionManager } from '../interactions/InteractionManager'

export class TextInserter {
  async insertText(transcript: string): Promise<boolean> {
    // If the string is empty, don't insert
    if (!transcript || !transcript.trim()) {
      return false
    }

    try {
      // Track text writer timing
      const interactionId = interactionManager.getCurrentInteractionId()
      if (interactionId) {
        timingCollector.startTiming(interactionId, TimingEventName.TEXT_WRITER)
      }

      const result = await setFocusedText(transcript)

      if (interactionId) {
        timingCollector.endTiming(interactionId, TimingEventName.TEXT_WRITER)
      }

      return result
    } catch (error) {
      console.error('Error inserting text:', error)
      const interactionId = interactionManager.getCurrentInteractionId()
      if (interactionId) {
        timingCollector.endTiming(interactionId, TimingEventName.TEXT_WRITER)
      }
      return false
    }
  }
}
