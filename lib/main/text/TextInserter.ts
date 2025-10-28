import { setFocusedText } from '../../media/text-writer'
import { timingCollector, TimingEventName } from '../timing/TimingCollector'

export class TextInserter {
  async insertText(transcript: string): Promise<boolean> {
    // If the string is empty, don't insert
    if (!transcript || !transcript.trim()) {
      return false
    }

    try {
      return await timingCollector.timeAsync(
        TimingEventName.TEXT_WRITER,
        async () => await setFocusedText(transcript),
      )
    } catch (error) {
      console.error('Error inserting text:', error)
      return false
    }
  }
}
