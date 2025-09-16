import { InteractionsTable } from '../sqlite/repo'
import mainStore from '../store'
import { STORE_KEYS } from '../../constants/store-keys'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'

export class InteractionManager {
  private currentInteractionId: string | null = null
  private interactionStartTime: number | null = null

  startInteraction(): string {
    this.currentInteractionId = uuidv4()
    this.interactionStartTime = Date.now()
    return this.currentInteractionId
  }

  getCurrentInteractionId(): string | null {
    return this.currentInteractionId
  }

  getInteractionStartTime(): number | null {
    return this.interactionStartTime
  }

  async createInteraction(
    transcript: string,
    audioBuffer: Buffer,
    sampleRate: number,
    errorMessage?: string,
  ) {
    if (!this.currentInteractionId) {
      log.warn(
        '[InteractionManager] No current interaction ID, skipping interaction creation.',
      )
      return
    }

    try {
      const userId = mainStore.get(STORE_KEYS.USER_PROFILE) as string | null
      if (!userId) {
        log.warn(
          '[InteractionManager] No user ID found, not creating interaction.',
        )
        return
      }

      const interactionData = {
        id: this.currentInteractionId,
        user_id: userId,
        title: transcript ? transcript.substring(0, 50) : 'No transcript',
        asr_output: transcript ? { transcript } : {},
        llm_output: errorMessage ? { error: errorMessage } : {},
        raw_audio: audioBuffer.length > 0 ? audioBuffer : null,
        duration_ms: this.interactionStartTime
          ? Date.now() - this.interactionStartTime
          : 0,
        sample_rate: sampleRate,
      }

      await InteractionsTable.insert(interactionData)
      log.info(
        `[InteractionManager] Created interaction: ${this.currentInteractionId} for user: ${userId}`,
      )
    } catch (error) {
      log.error('[InteractionManager] Failed to create interaction:', error)
    }
  }

  clearCurrentInteraction() {
    this.currentInteractionId = null
    this.interactionStartTime = null
  }
}
