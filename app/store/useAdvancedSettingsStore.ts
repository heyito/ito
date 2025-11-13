import { create } from 'zustand'
import { STORE_KEYS } from '../../lib/constants/store-keys'

export interface LlmSettings {
  asrProvider: string
  asrModel: string
  asrPrompt: string
  llmProvider: string
  llmModel: string
  llmTemperature: string
  transcriptionPrompt: string
  editingPrompt: string
  noSpeechThreshold: string
}

interface AdvancedSettingsState {
  llm: LlmSettings
  grammarServiceEnabled: boolean
  defaults?: LlmSettings
  setLlmSettings: (settings: Partial<LlmSettings>) => void
  setGrammarServiceEnabled: (enabled: boolean) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedAdvancedSettings = window.electron.store.get(
    STORE_KEYS.ADVANCED_SETTINGS,
  )

  console.log('Initial advanced settings from store:', storedAdvancedSettings)

  return {
    llm: storedAdvancedSettings.llm,
    grammarServiceEnabled:
      storedAdvancedSettings.grammarServiceEnabled ?? false,
    defaults: storedAdvancedSettings.defaults,
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
  }
})
