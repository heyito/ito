import { create } from 'zustand'

type PageType = 'home' | 'dictionary' | 'notes'

interface MainStore {
  navExpanded: boolean
  currentPage: PageType
  toggleNavExpanded: () => void
  setCurrentPage: (page: PageType) => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedMain = window.electron.store.get('main')

  return {
    navExpanded: storedMain?.navExpanded ?? false,
    currentPage: (storedMain?.currentPage as PageType) ?? 'home',
  }
}

// Sync to electron store
const syncToStore = (state: Partial<MainStore>) => {
  const currentStore = window.electron.store.get('main') || {}
  const updates: any = { ...currentStore }

  if ('navExpanded' in state) {
    updates.navExpanded = state.navExpanded ?? currentStore.navExpanded
  }

  window.electron.store.set('main', updates)
}

export const useMainStore = create<MainStore>(set => {
  const initialState = getInitialState()
  return {
    navExpanded: initialState.navExpanded,
    currentPage: 'home',
    toggleNavExpanded: () =>
      set(state => {
        const newState = { navExpanded: !state.navExpanded }
        syncToStore(newState)
        return newState
      }),
    setCurrentPage: (page: PageType) => set({ currentPage: page }),
  }
})
