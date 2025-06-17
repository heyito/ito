import { create } from 'zustand'

type PageType = 'home' | 'dictionary' | 'notes' | 'settings'
type SettingsPageType = 'general' | 'audio' | 'account'

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
  const storedMain = window.electron.store.get('main')

  return {
    navExpanded: storedMain?.navExpanded ?? false,
    currentPage: (storedMain?.currentPage as PageType) ?? 'home',
    settingsPage: (storedMain?.settingsPage as SettingsPageType) ?? 'general',
  }
}

// Sync to electron store
const syncToStore = (state: Partial<MainStore>) => {
  const currentStore = window.electron.store.get('main') || {}
  const updates: any = { ...currentStore }

  if ('navExpanded' in state) {
    updates.navExpanded = state.navExpanded ?? currentStore.navExpanded
  }

  if ('settingsPage' in state) {
    updates.settingsPage = state.settingsPage ?? currentStore.settingsPage
  }

  window.electron.store.set('main', updates)
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
