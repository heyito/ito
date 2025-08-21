import { getSelectedTextString } from './selected-text-reader'
import store from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import log from 'electron-log'

class ContextService {
  private isCapturingContext = false

  /**
   * Asynchronously captures the currently selected text and stores it in the context store.
   */
  async captureContextAsync(): Promise<void> {
    if (this.isCapturingContext) {
      log.warn('[ContextService] Context capture already in progress, skipping')
      return
    }

    this.isCapturingContext = true

    try {
      log.info('[ContextService] Starting async context capture')

      // Clear any existing context text first
      store.set(STORE_KEYS.CONTEXT, { contextText: '' })

      // Capture selected text (this may take some time)
      const selectedText = await getSelectedTextString()

      if (selectedText && selectedText.trim().length > 0) {
        log.info(
          `[ContextService] Captured context text: ${selectedText.length} characters`,
        )
        store.set(STORE_KEYS.CONTEXT, { contextText: selectedText.trim() })
      } else {
        log.info('[ContextService] No selected text found')
        store.set(STORE_KEYS.CONTEXT, { contextText: '' })
      }
    } catch (error) {
      log.error('[ContextService] Error capturing context:', error)
      store.set(STORE_KEYS.CONTEXT, { contextText: '' })
    } finally {
      this.isCapturingContext = false
    }
  }

  /**
   * Gets the current context text from the store.
   * This is synchronous and returns immediately.
   */
  getCurrentContext(): string {
    try {
      const context = store.get(STORE_KEYS.CONTEXT) as
        | { contextText?: string }
        | undefined
      return context?.contextText || ''
    } catch (error) {
      log.error('[ContextService] Error getting current context:', error)
      return ''
    }
  }

  /**
   * Clears the current context text from the store.
   */
  clearContext(): void {
    try {
      store.set(STORE_KEYS.CONTEXT, { contextText: '' })
      log.info('[ContextService] Context cleared')
    } catch (error) {
      log.error('[ContextService] Error clearing context:', error)
    }
  }

  /**
   * Checks if context capture is currently in progress.
   */
  isCapturing(): boolean {
    return this.isCapturingContext
  }
}

// Export singleton instance
export const contextService = new ContextService()
