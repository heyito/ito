import { create } from 'zustand'
import { STORE_KEYS } from '../../lib/constants/store-keys'

export interface LlmSettings {
  asrProvider: string
  asrModel: string
  asrPrompt: string
  llmProvider: string
  llmModel: string
  llmTemperature: number
  transcriptionPrompt: string
  editingPrompt: string
  noSpeechThreshold: number
}

interface AdvancedSettingsState {
  llm: LlmSettings
  grammarServiceEnabled: boolean
  macosAccessibilityContextEnabled: boolean
  setLlmSettings: (settings: Partial<LlmSettings>) => void
  setGrammarServiceEnabled: (enabled: boolean) => void
  setMacosAccessibilityContextEnabled: (enabled: boolean) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedAdvancedSettings = window.electron.store.get(
    STORE_KEYS.ADVANCED_SETTINGS,
  )

  return {
    llm: {
      asrProvider: storedAdvancedSettings.llm.asrProvider,
      asrModel: storedAdvancedSettings.llm.asrModel,
      asrPrompt: storedAdvancedSettings.llm.asrPrompt,
      llmProvider: storedAdvancedSettings.llm.llmProvider,
      llmModel: storedAdvancedSettings.llm.llmModel,
      llmTemperature: storedAdvancedSettings.llm.llmTemperature,
      transcriptionPrompt: storedAdvancedSettings.llm.transcriptionPrompt,
      editingPrompt: storedAdvancedSettings.llm.editingPrompt,
      noSpeechThreshold: storedAdvancedSettings.llm.noSpeechThreshold,
    },
    grammarServiceEnabled:
      storedAdvancedSettings.grammarServiceEnabled ?? false,
    macosAccessibilityContextEnabled:
      storedAdvancedSettings.macosAccessibilityContextEnabled ?? false,
  }
}

// Sync to electron store
const syncToStore = (state: Partial<AdvancedSettingsState>) => {
  const currentAdvancedSettings =
    window.electron.store.get(STORE_KEYS.ADVANCED_SETTINGS) || {}

  const updatedAdvancedSettings = {
    ...currentAdvancedSettings,
    ...state,
  }

  window.electron.store.set(
    STORE_KEYS.ADVANCED_SETTINGS,
    updatedAdvancedSettings,
  )
}

export const useAdvancedSettingsStore = create<AdvancedSettingsState>(set => {
  const initialState = getInitialState()

  return {
    ...initialState,
    setLlmSettings: (settings: Partial<LlmSettings>) => {
      set(state => {
        const newLlmSettings = { ...state.llm, ...settings }
        const partialState = { llm: newLlmSettings }
        syncToStore(partialState)
        return partialState
      })
    },
    setGrammarServiceEnabled: (enabled: boolean) => {
      set(() => {
        const partialState = { grammarServiceEnabled: enabled }
        syncToStore(partialState)
        return partialState
      })
    },
    setMacosAccessibilityContextEnabled: (enabled: boolean) => {
      set(() => {
        const partialState = { macosAccessibilityContextEnabled: enabled }
        syncToStore(partialState)
        return partialState
      })
    },
  }
})
