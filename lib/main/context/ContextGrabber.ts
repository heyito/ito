import { ItoMode } from '@/app/generated/ito_pb'
import { DictionaryTable } from '../sqlite/repo'
import { getCurrentUserId, getAdvancedSettings } from '../store'
import { getActiveWindow } from '../../media/active-application'
import {
  getSelectedTextString,
  getCursorContext,
} from '../../media/selected-text-reader'
import { canGetContextFromCurrentApp } from '../../utils/applicationDetection'
import log from 'electron-log'
import { timingCollector, TimingEventName } from '../timing/TimingCollector'

export interface ContextData {
  vocabularyWords: string[]
  windowTitle: string
  appName: string
  contextText: string
  advancedSettings: ReturnType<typeof getAdvancedSettings>
}

/**
 * ContextGrabber centralizes all context gathering logic for transcription streams.
 * It collects vocabulary, window info, selected text, and settings.
 */
export class ContextGrabber {
  /**
   * Gather all context data needed for a transcription stream
   */
  public async gatherContext(mode: ItoMode): Promise<ContextData> {
    console.log('[ContextGrabber] Gathering context for mode:', mode)

    // Get vocabulary words from dictionary
    const vocabularyWords = await this.getVocabulary()

    // Get active window context
    const { windowTitle, appName } = await timingCollector.timeAsync(
      TimingEventName.WINDOW_CONTEXT_GATHER,
      async () => await this.getWindowContext(),
    )

    // Get selected text if in EDIT mode
    const contextText = await this.getContextText(mode)

    // Get advanced settings
    const advancedSettings = getAdvancedSettings()

    console.log('[ContextGrabber] Context gathered successfully')

    return {
      vocabularyWords,
      windowTitle,
      appName,
      contextText,
      advancedSettings,
    }
  }

  private async getVocabulary(): Promise<string[]> {
    try {
      const userId = getCurrentUserId()
      const dictionaryItems = await DictionaryTable.findAll(userId)
      return dictionaryItems
        .filter(item => item.deleted_at === null)
        .map(item => item.word)
    } catch (error) {
      log.error('[ContextGrabber] Error getting vocabulary:', error)
      return []
    }
  }

  private async getWindowContext(): Promise<{
    windowTitle: string
    appName: string
  }> {
    try {
      const windowContext = await getActiveWindow()
      return {
        windowTitle: windowContext?.title || '',
        appName: windowContext?.appName || '',
      }
    } catch (error) {
      log.error('[ContextGrabber] Error getting window context:', error)
      return {
        windowTitle: '',
        appName: '',
      }
    }
  }

  private async getContextText(mode: ItoMode): Promise<string> {
    if (mode !== ItoMode.EDIT) {
      return ''
    }

    try {
      const text = await timingCollector.timeAsync(
        TimingEventName.SELCTED_TEXT_GATHER,
        async () => await getSelectedTextString(),
      )
      console.log('[ContextGrabber] Selected text:', text)
      return text && text.trim().length > 0 ? text : ''
    } catch (error) {
      log.error('[ContextGrabber] Error getting context text:', error)
      return ''
    }
  }

  /**
   * Get cursor context for grammar rules (capitalization, spacing, etc.)
   * This fetches a small amount of text before the cursor position.
   *
   * @param contextLength - Number of characters to fetch before cursor (default: 4)
   * @returns The text before the cursor, or empty string if unavailable
   */
  public async getCursorContextForGrammar(
    contextLength: number = 4,
  ): Promise<string> {
    try {
      const canGetContext = await canGetContextFromCurrentApp()

      if (!canGetContext) {
        console.log(
          '[ContextGrabber] Cannot get cursor context from current app',
        )
        return ''
      }

      const cursorContext = await getCursorContext(contextLength)
      return cursorContext || ''
    } catch (error) {
      log.error(
        '[ContextGrabber] Error getting cursor context for grammar:',
        error,
      )
      return ''
    }
  }
}

export const contextGrabber = new ContextGrabber()
