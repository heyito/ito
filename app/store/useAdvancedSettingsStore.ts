import { create } from 'zustand'
import { STORE_KEYS } from '../../lib/constants/store-keys'

interface LlmSettings {
  asrModel: string
}

interface AdvancedSettingsState {
  llm: LlmSettings
  setLlmSettings: (settings: Partial<LlmSettings>) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedAdvancedSettings = window.electron.store.get(
    STORE_KEYS.ADVANCED_SETTINGS,
  )

  return {
    llm: {
      asrModel: storedAdvancedSettings.llm.asrModel,
    },
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
  }
})
