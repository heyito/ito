import { create } from 'zustand'
import type { ContextStore } from '../../lib/main/store'
import { STORE_KEYS } from '../../lib/constants/store-keys'

interface ContextZustandStore {
  // State
  contextText: string
  isLoadingContext: boolean
  error: string | null

  // Actions
  setContextText: (text: string) => void
  clearContextText: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedContext = window.electron?.store?.get(STORE_KEYS.CONTEXT) as ContextStore | undefined

  return {
    contextText: storedContext?.contextText || '',
    isLoadingContext: false,
    error: null,
  }
}

// Sync to electron store
const syncToStore = (state: Partial<ContextZustandStore>) => {
  const currentContext = window.electron.store.get(STORE_KEYS.CONTEXT) || {}
  
  const updatedContext = {
    ...currentContext,
    contextText: state.contextText || currentContext.contextText || '',
  }

  window.electron.store.set(STORE_KEYS.CONTEXT, updatedContext)
}

export const useContextStore = create<ContextZustandStore>((set, get) => {
  const initialState = getInitialState()

  return {
    ...initialState,
    
    setContextText: (text: string) => {
      const partialState = { contextText: text }
      set(partialState)
      syncToStore(partialState)
    },

    clearContextText: () => {
      const partialState = { contextText: '' }
      set(partialState)
      syncToStore(partialState)
    },

    setLoading: (loading: boolean) => {
      set({ isLoadingContext: loading })
    },

    setError: (error: string | null) => {
      set({ error })
    },
  }
})