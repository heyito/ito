import { InteractionsTable } from '../sqlite/repo'
import mainStore from '../store'
import { STORE_KEYS } from '../../constants/store-keys'
import log from 'electron-log'
import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'
import { timingCollector } from '../timing/TimingCollector'

export class InteractionManager {
  private currentInteractionId: string | null = null
  private interactionStartTime: number | null = null

  initialize(): string {
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

  adoptInteractionId(id: string) {
    this.currentInteractionId = id
    this.interactionStartTime = Date.now()
  }

  async createInteraction(
    transcript: string,
    audioBuffer: Buffer,
    sampleRate: number,
    errorMessage?: string,
    errorCode?: string,
  ) {
    if (!this.currentInteractionId) {
      log.warn(
        '[InteractionManager] No current interaction ID, skipping interaction creation.',
      )
      return
    }

    try {
      const userProfile = mainStore.get(STORE_KEYS.USER_PROFILE) as any
      const userId = userProfile?.id

      if (!userId) {
        log.warn(
          '[InteractionManager] No user ID found, not creating interaction.',
        )
        return
      }

      // Calculate interaction duration
      const interactionEndTime = Date.now()
      const durationMs = this.interactionStartTime
        ? interactionEndTime - this.interactionStartTime
        : 0

      // Create ASR output object with comprehensive information
      const asrOutput = {
        transcript,
        totalAudioBytes: audioBuffer.length,
        error: errorMessage || null,
        errorCode: errorCode || null,
        timestamp: new Date().toISOString(),
        durationMs,
      }

      // Generate a meaningful title from the transcript
      const title =
        transcript && transcript.length > 50
          ? transcript.substring(0, 50) + '...'
          : transcript || 'Voice interaction'

      // Create interaction using upsert to specify our own ID
      const now = new Date().toISOString()
      const interactionData = {
        id: this.currentInteractionId,
        user_id: userId,
        title,
        asr_output: asrOutput,
        llm_output: errorMessage ? { error: errorMessage } : {},
        raw_audio: audioBuffer.length > 0 ? audioBuffer : null,
        raw_audio_id: null,
        duration_ms: durationMs,
        sample_rate: sampleRate,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }

      await InteractionsTable.upsert(interactionData)

      // Notify all windows about the new interaction
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('interaction-created', {
          id: this.currentInteractionId,
          transcript,
          timestamp: now,
          durationMs,
        })
      })
    } catch (error) {
      log.error('[InteractionManager] Failed to create interaction:', error)
      // Clear timing on error
      if (this.currentInteractionId) {
        timingCollector.clearInteraction(this.currentInteractionId)
      }
    }
  }

  clearCurrentInteraction() {
    this.currentInteractionId = null
    this.interactionStartTime = null
  }
}

export const interactionManager = new InteractionManager()
