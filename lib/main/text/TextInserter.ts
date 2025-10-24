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
      const interactionId = interactionManager.getCurrentInteractionId()

      return await timingCollector.timeAsync(
        interactionId,
        TimingEventName.TEXT_WRITER,
        async () => await setFocusedText(transcript),
      )
    } catch (error) {
      console.error('Error inserting text:', error)
      return false
    }
  }
}
