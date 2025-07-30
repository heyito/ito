import { create } from 'zustand'
import { STORE_KEYS } from '../../lib/constants/store-keys'

type PageType = 'home' | 'dictionary' | 'notes' | 'settings'
type SettingsPageType =
  | 'general'
  | 'keyboard'
  | 'audio'
  | 'account'
  | 'advanced'

interface MainStore {
  navExpanded: boolean
  currentPage: PageType
  settingsPage: SettingsPageType
  toggleNavExpanded: () => void
  setCurrentPage: (page: PageType) => void
  setSettingsPage: (page: SettingsPageType) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedMain = window.electron.store.get(STORE_KEYS.MAIN)

  return {
    navExpanded: storedMain?.navExpanded ?? true,
    currentPage: (storedMain?.currentPage as PageType) ?? 'home',
    settingsPage: (storedMain?.settingsPage as SettingsPageType) ?? 'general',
  }
}

// Sync to electron store
const syncToStore = (state: Partial<MainStore>) => {
  const currentStore = window.electron.store.get(STORE_KEYS.MAIN) || {}
  const updates: any = { ...currentStore }

  if ('navExpanded' in state) {
    updates.navExpanded = state.navExpanded ?? currentStore.navExpanded
  }

  if ('settingsPage' in state) {
    updates.settingsPage = state.settingsPage ?? currentStore.settingsPage
  }

  window.electron.store.set(STORE_KEYS.MAIN, updates)
}

export const useMainStore = create<MainStore>(set => {
  const initialState = getInitialState()
  return {
    navExpanded: initialState.navExpanded,
    currentPage: 'home',
    settingsPage: initialState.settingsPage,
    toggleNavExpanded: () =>
      set(state => {
        const newState = { navExpanded: !state.navExpanded }
        syncToStore(newState)
        return newState
      }),
    setCurrentPage: (page: PageType) => set({ currentPage: page }),
    setSettingsPage: (page: SettingsPageType) => {
      const newState = { settingsPage: page }
      syncToStore(newState)
      set(newState)
    },
  }
})
